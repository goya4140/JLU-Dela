import { StepButton } from './step-controls';
import { StepGuide } from './step-guide';

export function WelcomeStep({ onDone }: { onDone: () => void }) {
  return (
    <div className="grid gap-7">
      <header className="grid gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">使用须知</h2>
        <p className="text-13 leading-relaxed text-ink-3">
          先了解三个入口，再按需配置。模型和校园账号都可以稍后设置。
        </p>
      </header>
      <StepGuide
        steps={[
          {
            title: '从本地资料开始',
            content: (
              <p className="text-13 leading-relaxed text-ink-3">
                在知识库连接已有文件夹，进入课程目录并设为课程。连接保持文件原位，编辑和新建笔记会实际写入文件。
              </p>
            ),
          },
          {
            title: '按需连接学校平台',
            content: (
              <p className="text-13 leading-relaxed text-ink-3">
                教务单独配置，可能需要微信认证；通知、学在吉大和学习通分别连接。学生邮箱直接填写邮箱地址和邮箱密码。
              </p>
            ),
          },
          {
            title: '配置模型后再开始 AI 学习',
            content: (
              <p className="text-13 leading-relaxed text-ink-3">
                API Key
                来自模型服务，与校园密码不同。发送对话时，引用资料和按需读取的内容可能进入所选模型服务。
              </p>
            ),
          },
        ]}
      />
      <p className="text-xs text-ink-3">完整操作说明和连接状态可在「设置 → 使用指南」随时查看。</p>
      <StepButton
        state="idle"
        idleLabel="开始配置"
        busyLabel="开始配置"
        successLabel="开始配置"
        type="button"
        onClick={onDone}
      />
    </div>
  );
}
