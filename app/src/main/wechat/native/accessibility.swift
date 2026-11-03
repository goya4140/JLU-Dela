import AppKit
import ApplicationServices
import Foundation

var previousApplication: NSRunningApplication?

func attribute<T>(_ element: AXUIElement, _ name: String) -> T? {
  var value: CFTypeRef?
  guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else {
    return nil
  }
  return value as? T
}

func children(_ element: AXUIElement) -> [AXUIElement] {
  attribute(element, kAXChildrenAttribute) ?? []
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
  let detail =
    collapsed
    ? "系统目前只提供微信的窗口按钮，没有提供会话列表、消息或输入框，Dela 暂时无法读取和回复。"
    : "未识别到微信的会话列表和输入框，请打开聊天窗口后刷新；若已打开，当前窗口布局尚未适配。"
  if command == "send" || command == "select" { fail(detail) }
  respond([
    "phase": windows.isEmpty ? "unavailable" : "inaccessible", "detail": detail, "chats": [],
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
    let item = sessionItems.first(where: { identifier($0) == target })
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
  RunLoop.current.run(until: Date().addingTimeInterval(0.2))
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
    RunLoop.current.run(until: Date().addingTimeInterval(0.05))
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
