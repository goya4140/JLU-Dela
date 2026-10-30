import { ExternalLink, FolderOpen, GraduationCap } from 'lucide-react';
import { jluServices, type JluServiceId } from '../../../shared/jlu';
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
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          <p className="text-13 leading-relaxed text-ink-3">
            课表支持在应用中登录同步，当前为接入预览。课程资料与通知仍需前往学校平台。
          </p>
        </header>
        <div className="grid gap-4" data-setting-id="jlu-campus">
          {services.map((service) => (
            <section className="grid gap-3 rounded-xl border border-line p-5" key={service.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-ink">{service.name}</h2>
                <span className="rounded-full bg-field px-2.5 py-1 text-xs text-ink-3">
                  {service.integration === 'preview' ? '课表接入预览' : '同步待接入'}
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
                <Button asChild size="sm" variant="outline">
                  <a href={service.url} rel="noreferrer" target="_blank">
                    前往学校平台
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                </Button>
              </div>
            </section>
          ))}
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
