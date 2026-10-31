import { ExternalLink, FolderOpen, GraduationCap } from 'lucide-react';
import { jluServices, jluStudentMail, type JluServiceId } from '../../../shared/jlu';
import { Button } from '../../components/ui/button';
import { useNavigationStore } from '../../navigation/view';

export function CampusView({
  title = '吉大校园',
  serviceIds,
}: {
  title?: string;
  serviceIds?: JluServiceId[];
}) {
  const services = jluServices.filter((service) => !serviceIds || serviceIds.includes(service.id));
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-surface">
      <div className="mx-auto grid w-full max-w-4xl gap-8 px-6 py-10 md:px-10">
        <header className="grid gap-3">
          <div className="flex items-center gap-2 text-sm text-ink-3">
            <GraduationCap className="size-5" aria-hidden="true" />
            JLU Dela · 本科生开发预览
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
            <Button
              size="sm"
              variant="outline"
              onClick={() => useNavigationStore.getState().openSettings('guide')}
            >
              使用指南与连接配置
            </Button>
          </div>
          <p className="text-13 leading-relaxed text-ink-3">
            读取课表、校内通知、学在吉大及学习通课程，并可连接吉大邮箱，已同步内容保存在本机。
          </p>
        </header>
        <div className="grid gap-4" data-setting-id="jlu-campus">
          {services.map((service) => (
            <section className="grid gap-3 rounded-xl border border-line p-5" key={service.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-ink">{service.name}</h2>
                <span className="rounded-full bg-field px-2.5 py-1 text-xs text-ink-3">
                  {service.id === 'academic' ? '课表接入预览' : '接入预览'}
                </span>
              </div>
              <p className="text-13 text-ink-3">{service.description}</p>
              <div className="flex flex-wrap gap-2">
                {service.id === 'academic' && (
                  <Button
                    size="sm"
                    onClick={() => useNavigationStore.getState().navigate('timetable')}
                  >
                    打开课表
                  </Button>
                )}
                {service.id !== 'academic' && (
                  <Button
                    size="sm"
                    onClick={() =>
                      useNavigationStore
                        .getState()
                        .navigate(
                          service.id === 'notices'
                            ? 'notifications'
                            : service.id === 'chaoxing'
                              ? 'chaoxing'
                              : 'classroom',
                        )
                    }
                  >
                    {service.id === 'notices'
                      ? '打开通知'
                      : service.id === 'chaoxing'
                        ? '打开学习通'
                        : '打开学在吉大'}
                  </Button>
                )}
                <Button asChild size="sm" variant="outline">
                  <a href={service.url} rel="noreferrer" target="_blank">
                    前往学校平台
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                </Button>
              </div>
            </section>
          ))}
          {!serviceIds && <MailCard />}
        </div>
        <section className="grid gap-3 rounded-xl bg-field p-5">
          <h2 className="text-base font-semibold text-ink">先整理你的课程资料</h2>
          <p className="text-13 leading-relaxed text-ink-3">
            可以把已下载的课件导入资料工作台，按课程创建项目。配置模型服务后，可与 Agent
            一起阅读和整理资料。
          </p>
          <div>
            <Button onClick={() => useNavigationStore.getState().openProject('')} size="sm">
              <FolderOpen className="size-4" aria-hidden="true" />
              打开课程资料
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

/** 吉大学生邮箱：入口与「课表」「学习通」一致，账号在邮箱页连接。 */
function MailCard() {
  return (
    <section className="grid gap-3 rounded-xl border border-line p-5" data-setting-id="jlu-mail">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-ink">{jluStudentMail.name}</h2>
        <span className="rounded-full bg-field px-2.5 py-1 text-xs text-ink-3">接入预览</span>
      </div>
      <p className="text-13 text-ink-3">
        用学生邮箱账号（@mails.jlu.edu.cn）在本机收发、检索邮件，凭据只保存在本机。
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => useNavigationStore.getState().navigate('mail')}>
          打开邮箱
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href={jluStudentMail.url} rel="noreferrer" target="_blank">
            前往邮箱网站
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        </Button>
      </div>
    </section>
  );
}
