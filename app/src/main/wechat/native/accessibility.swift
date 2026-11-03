import AppKit
import ApplicationServices
import Foundation
import ScreenCaptureKit

var previousApplication: NSRunningApplication?
var restoreClipboard: (() -> Void)?

func attribute<T>(_ element: AXUIElement, _ name: String) -> T? {
  var value: CFTypeRef?
  guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else {
    return nil
  }
  return value as? T
}

func children(_ element: AXUIElement) -> [AXUIElement] {
  var nodes: [AXUIElement] = attribute(element, kAXChildrenAttribute) ?? []
  let role: String = attribute(element, kAXRoleAttribute) ?? ""
  if role == kAXWindowRole {
    for name in [kAXContentsAttribute, kAXVisibleChildrenAttribute, "AXChildrenInNavigationOrder"] {
      let alternatives: [AXUIElement] = attribute(element, name) ?? []
      for candidate in alternatives
      where !CFEqual(candidate, element) && !nodes.contains(where: { CFEqual($0, candidate) }) {
        nodes.append(candidate)
      }
    }
  }
  return nodes
}

func identifier(_ element: AXUIElement) -> String {
  attribute(element, kAXIdentifierAttribute) ?? ""
}

func text(_ element: AXUIElement) -> String {
  let value: String? = attribute(element, kAXValueAttribute)
  let title: String? = attribute(element, kAXTitleAttribute)
  let description: String? = attribute(element, kAXDescriptionAttribute)
  return [value, title, description].compactMap { $0 }.first { !$0.isEmpty } ?? ""
}

func find(_ root: AXUIElement, _ id: String, _ depth: Int = 0) -> AXUIElement? {
  if identifier(root) == id { return root }
  guard depth < 16, !["chat_message_list", "session_list"].contains(identifier(root)) else {
    return nil
  }
  for child in children(root) {
    if let match = find(child, id, depth + 1) { return match }
  }
  return nil
}

func messageText(_ root: AXUIElement, _ depth: Int = 0) -> String {
  let own = text(root)
  if !own.isEmpty { return own }
  guard depth < 6 else { return "" }
  return children(root).map { messageText($0, depth + 1) }.filter { !$0.isEmpty }.joined(
    separator: "\n")
}

func respond(_ value: [String: Any]) -> Never {
  restoreClipboard?()
  previousApplication?.activate(options: [])
  let data = try! JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
  FileHandle.standardOutput.write(data)
  exit(0)
}

func fail(_ message: String) -> Never { respond(["error": message]) }

let command = CommandLine.arguments.dropFirst().first ?? "snapshot"
let inputData = FileHandle.standardInput.readDataToEndOfFile()
let input = (try? JSONSerialization.jsonObject(with: inputData)) as? [String: Any] ?? [:]
if command == "authorize" {
  let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
  _ = AXIsProcessTrustedWithOptions(options)
}
guard AXIsProcessTrusted() else {
  respond(["phase": "permission", "chats": [], "current": NSNull()])
}
guard
  let wechat = NSRunningApplication.runningApplications(
    withBundleIdentifier: "com.tencent.xinWeChat"
  ).first
else {
  respond(["phase": "closed", "chats": [], "current": NSNull()])
}
let app = AXUIElementCreateApplication(wechat.processIdentifier)
AXUIElementSetMessagingTimeout(app, 2)
if command == "authorize" {
  let enhanced: Bool? = attribute(app, "AXEnhancedUserInterface")
  var settable = DarwinBoolean(false)
  if enhanced == false,
    AXUIElementIsAttributeSettable(app, "AXEnhancedUserInterface" as CFString, &settable)
      == .success,
    settable.boolValue
  {
    _ = AXUIElementSetAttributeValue(app, "AXEnhancedUserInterface" as CFString, kCFBooleanTrue)
  }
}
if command == "prepare-manual-reply" || command == "submit-manual-reply" {
  NSApplication.shared.setActivationPolicy(.prohibited)
  previousApplication = NSWorkspace.shared.frontmostApplication
  wechat.activate(options: [])
  try await Task.sleep(for: .milliseconds(250))
  guard NSWorkspace.shared.frontmostApplication?.processIdentifier == wechat.processIdentifier
  else {
    fail("未能激活原微信，操作未提交。请先打开目标会话并点击输入框。")
  }
  if command == "prepare-manual-reply" {
    guard let message = input["text"] as? String, !message.isEmpty,
      message.rangeOfCharacter(from: CharacterSet.controlCharacters.union(.newlines)) == nil
    else { fail("兼容发送仅支持单行文字。") }
    let pasteboard = NSPasteboard.general
    let savedItems = (pasteboard.pasteboardItems ?? []).map { item in
      let saved = NSPasteboardItem()
      for type in item.types {
        if let data = item.data(forType: type) { saved.setData(data, forType: type) }
      }
      return saved
    }
    pasteboard.clearContents()
    guard pasteboard.setString(message, forType: .string) else {
      pasteboard.clearContents()
      if !savedItems.isEmpty { pasteboard.writeObjects(savedItems) }
      fail("未能准备系统粘贴，原微信草稿未提交。")
    }
    let pasteChange = pasteboard.changeCount
    restoreClipboard = {
      if pasteboard.changeCount == pasteChange {
        pasteboard.clearContents()
        if !savedItems.isEmpty { pasteboard.writeObjects(savedItems) }
      }
    }
    guard let down = CGEvent(keyboardEventSource: nil, virtualKey: 9, keyDown: true),
      let up = CGEvent(keyboardEventSource: nil, virtualKey: 9, keyDown: false)
    else { fail("未能创建系统粘贴事件。") }
    down.flags = .maskCommand
    up.flags = .maskCommand
    down.post(tap: .cghidEventTap)
    up.post(tap: .cghidEventTap)
    try await Task.sleep(for: .milliseconds(350))

  } else {
    guard let down = CGEvent(keyboardEventSource: nil, virtualKey: 36, keyDown: true),
      let up = CGEvent(keyboardEventSource: nil, virtualKey: 36, keyDown: false)
    else { fail("未能创建发送事件，请在原微信检查结果。") }
    down.flags = []
    up.flags = []
    down.post(tap: .cghidEventTap)
    up.post(tap: .cghidEventTap)
  }
  try await Task.sleep(for: .milliseconds(150))
  respond(["ok": true])
}
if command == "capture-preview" {
  NSApplication.shared.setActivationPolicy(.prohibited)
  guard CGPreflightScreenCaptureAccess() else {
    _ = CGRequestScreenCaptureAccess()
    fail("请在系统设置的屏幕与系统音频录制中允许预览程序，然后重新打开 Dela 预览。")
  }
  do {
    let content = try await SCShareableContent.excludingDesktopWindows(
      true, onScreenWindowsOnly: true)
    guard
      let window = content.windows.filter({
        $0.owningApplication?.processID == wechat.processIdentifier && $0.windowLayer == 0
          && $0.frame.width >= 300 && $0.frame.height >= 200
      }).max(by: { $0.frame.width * $0.frame.height < $1.frame.width * $1.frame.height })
    else {
      fail("没有找到可捕获的微信主窗口，请保持原微信窗口打开。")
    }
    let configuration = SCStreamConfiguration()
    configuration.width = Int(window.frame.width * 2)
    configuration.height = Int(window.frame.height * 2)
    configuration.showsCursor = false
    configuration.capturesAudio = false
    let image: CGImage = try await withCheckedThrowingContinuation { continuation in
      SCScreenshotManager.captureImage(
        contentFilter: SCContentFilter(desktopIndependentWindow: window),
        configuration: configuration
      ) { image, error in
        if let image {
          continuation.resume(returning: image)
        } else {
          continuation.resume(
            throwing: error
              ?? NSError(
                domain: "DelaWechatCapture", code: 1,
                userInfo: [NSLocalizedDescriptionKey: "系统没有返回窗口画面"]))
        }
      }
    }
    let bitmap = NSBitmapImageRep(cgImage: image)
    var visibleSamples = 0
    var colors = Set<String>()
    for row in 0..<5 {
      for column in 0..<5 {
        if let color = bitmap.colorAt(
          x: (column * 2 + 1) * image.width / 10, y: (row * 2 + 1) * image.height / 10)?
          .usingColorSpace(.deviceRGB)
        {
          if color.alphaComponent > 0.01 { visibleSamples += 1 }
          colors.insert(
            "\(Int(color.redComponent * 255)),\(Int(color.greenComponent * 255)),\(Int(color.blueComponent * 255)),\(Int(color.alphaComponent * 255))"
          )
        }
      }
    }
    let windowInfo =
      (CGWindowListCopyWindowInfo(.optionIncludingWindow, window.windowID) as? [[String: Any]])?
      .first
    let sharing = windowInfo?[kCGWindowSharingState as String] as? Int
    let info =
      "窗口 \(window.windowID)，\(image.width) × \(image.height)；不透明采样 \(visibleSamples)/25，颜色样本 \(colors.count)；共享标志 \(sharing.map(String.init) ?? "未知")；屏幕 \(content.displays.count)。"
    guard let data = bitmap.representation(using: .png, properties: [:]) else {
      fail("未能生成微信窗口画面。")
    }
    respond(["image": "data:image/png;base64," + data.base64EncodedString(), "info": info])
  } catch { fail("系统窗口捕获失败：" + error.localizedDescription) }
}
let windows: [AXUIElement] = attribute(app, kAXWindowsAttribute) ?? []
guard let window = windows.first(where: { find($0, "session_list") != nil }),
  let sessions = find(window, "session_list")
else {
  let collapsed =
    !windows.isEmpty
    && windows.contains { window in
      let nodes = children(window)
      return !nodes.isEmpty
        && nodes.allSatisfy { node in
          let subrole: String = attribute(node, kAXSubroleAttribute) ?? ""
          return [
            kAXCloseButtonSubrole, kAXFullScreenButtonSubrole, kAXZoomButtonSubrole,
            kAXMinimizeButtonSubrole,
          ]
          .contains(subrole)
        }
    }
  let version =
    wechat.bundleURL.flatMap {
      Bundle(url: $0)?.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
    } ?? "未知"
  let branches = windows.map { window in
    [
      kAXChildrenAttribute, kAXContentsAttribute, kAXVisibleChildrenAttribute,
      "AXChildrenInNavigationOrder",
    ].map { name in
      let values: [AXUIElement] = attribute(window, name) ?? []
      return "\(name):\(values.count)"
    }.joined(separator: "，")
  }.joined(separator: "；")
  let enhanced: Bool? = attribute(app, "AXEnhancedUserInterface")
  let diagnostic =
    "\n微信 \(version)；窗口 \(windows.count)；\(branches)；增强接口：\(enhanced.map { $0 ? "开启" : "关闭" } ?? "不可用")；窗口捕获：\(CGPreflightScreenCaptureAccess() ? "已授权" : "未授权")。"
  let detail =
    collapsed
    ? "系统目前只提供微信的窗口按钮，没有提供会话列表、消息或输入框，Dela 暂时无法读取和回复。"
    : "未识别到微信的会话列表和输入框，请打开聊天窗口后刷新；若已打开，当前窗口布局尚未适配。"
  if command == "send" || command == "select" { fail(detail) }
  respond([
    "phase": windows.isEmpty ? "unavailable" : "inaccessible", "detail": detail + diagnostic,
    "chats": [],
    "current": NSNull(),
  ])
}
let loadedItems = children(sessions).filter { identifier($0).hasPrefix("session_item_") }
let identifierCounts = Dictionary(grouping: loadedItems, by: identifier)
let sessionItems = loadedItems.filter { identifierCounts[identifier($0)]?.count == 1 }
let titleNode = find(window, "current_chat_name_label")
let currentTitle = titleNode.map(text) ?? ""
let currentId =
  sessionItems.first { identifier($0) == "session_item_" + currentTitle }.map(identifier)
  ?? "session_item_" + currentTitle

if command == "select" {
  guard let target = input["chatId"] as? String,
    sessionItems.contains(where: { identifier($0) == target })
  else {
    fail("此会话当前不在微信列表中，请在原微信中打开后刷新。")
  }
  if target == currentId { respond(["ok": true]) }
  fail("请先在原微信中打开此会话，再回到 Dela 刷新。")
}

if command == "send" {
  guard input["chatId"] as? String == currentId, !currentTitle.isEmpty,
    sessionItems.contains(where: { identifier($0) == currentId }),
    let editor = find(window, "chat_input_field")
  else {
    fail("原微信已切换会话，请刷新并确认接收对象后再发送。")
  }
  guard let existingDraft: String = attribute(editor, kAXValueAttribute), existingDraft.isEmpty
  else { fail("原微信中已有未发送草稿，请先处理草稿。") }
  guard let message = input["text"] as? String,
    !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  else {
    fail("消息不能为空。")
  }
  var settable = DarwinBoolean(false)
  guard
    AXUIElementIsAttributeSettable(editor, kAXValueAttribute as CFString, &settable) == .success,
    settable.boolValue
  else { fail("当前微信输入框不支持辅助功能写入。") }
  previousApplication = NSWorkspace.shared.frontmostApplication
  wechat.activate(options: [])
  _ = AXUIElementPerformAction(window, kAXRaiseAction as CFString)
  try await Task.sleep(for: .milliseconds(200))
  guard NSWorkspace.shared.frontmostApplication?.processIdentifier == wechat.processIdentifier,
    titleNode.map(text) == currentTitle,
    let latestDraft: String = attribute(editor, kAXValueAttribute), latestDraft.isEmpty
  else {
    fail("原微信状态已变化，消息没有发送，请检查会话和草稿。")
  }
  guard
    AXUIElementSetAttributeValue(editor, kAXValueAttribute as CFString, message as CFString)
      == .success
  else {
    fail("未能填入微信输入框，消息没有发送。")
  }
  guard let inserted: String = attribute(editor, kAXValueAttribute), inserted == message else {
    fail("未能确认微信草稿内容，消息没有发送，请在原微信中检查。")
  }
  guard titleNode.map(text) == currentTitle else { fail("原微信已切换会话，已停止发送，请检查原微信草稿。") }
  guard
    AXUIElementSetAttributeValue(editor, kAXFocusedAttribute as CFString, kCFBooleanTrue)
      == .success,
    let keyDown = CGEvent(keyboardEventSource: nil, virtualKey: 36, keyDown: true),
    let keyUp = CGEvent(keyboardEventSource: nil, virtualKey: 36, keyDown: false)
  else {
    fail("无法定位微信输入框，文字已保留在原微信草稿中。")
  }
  keyDown.flags = []
  keyUp.flags = []
  keyDown.postToPid(wechat.processIdentifier)
  keyUp.postToPid(wechat.processIdentifier)
  let deadline = Date().addingTimeInterval(1)
  while (attribute(editor, kAXValueAttribute) as String?)?.isEmpty == false && Date() < deadline {
    try await Task.sleep(for: .milliseconds(50))
  }
  guard let remaining: String = attribute(editor, kAXValueAttribute), remaining.isEmpty else {
    fail("文字仍在原微信草稿中，未确认发送，请在原微信中检查。")
  }
  respond(["ok": true])
}

let chats: [[String: String]] = sessionItems.map {
  let id = identifier($0)
  return ["id": id, "name": String(id.dropFirst("session_item_".count)), "preview": text($0)]
}
var current: Any = NSNull()
if !currentTitle.isEmpty, (input["chatIds"] as? [String] ?? []).contains(currentId),
  let list = find(window, "chat_message_list")
{
  let messages = children(list).suffix(200).map {
    ["nativeId": identifier($0), "text": messageText($0)]
  }.filter { !$0["text", default: ""].isEmpty }
  var canSend = DarwinBoolean(false)
  if let editor = find(window, "chat_input_field") {
    _ = AXUIElementIsAttributeSettable(editor, kAXValueAttribute as CFString, &canSend)
  }
  current = [
    "id": currentId, "name": currentTitle, "messages": messages, "canSend": canSend.boolValue,
  ]
}
respond(["phase": "online", "chats": chats, "current": current])
