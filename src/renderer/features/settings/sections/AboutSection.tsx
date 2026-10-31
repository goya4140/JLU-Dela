import { DelaBrand } from '../../../components/ui/dela-brand';
import { product } from '../../../../shared/product';
import { teamMembers } from '../credits';
import { SectionHeader } from '../SectionHeader';

export function AboutSection() {
  return (
    <div className="grid gap-10" data-setting-id="about">
      <SectionHeader title="关于" />
      <section className="grid justify-items-center gap-1.5 px-6 py-6 text-center">
        <DelaBrand className="h-48 w-48" />
        <h2 className="text-4xl font-script tracking-tight">{product.name}</h2>
        <p className="text-13 text-ink-3">面向吉林大学本科生的本地学习工作台</p>
        <p className="mt-5 text-xs text-ink-3">版本 {window.dela?.version ?? '浏览器预览'}</p>
      </section>
      <section className="grid gap-3" aria-label="开发团队">
        <h2 className="text-base font-semibold">开发团队</h2>
        {teamMembers.map((person) => (
          <div className="flex min-w-0 items-center gap-3 py-1" key={person.name}>
            <img
              alt=""
              aria-hidden="true"
              className="size-8 shrink-0 rounded-full object-cover"
              src={person.avatar}
            />
            <div className="min-w-0 flex-1">
              <p className="break-words text-13 font-medium text-ink">{person.name}</p>
              <p className="mt-1 text-xs text-ink-3">{person.role}</p>
            </div>
            <a
              aria-label={`${person.name} 的 GitHub 主页`}
              className="shrink-0 text-xs text-ink-3 hover:text-ink"
              href={person.github}
              rel="noreferrer"
              target="_blank"
            >
              GitHub
            </a>
          </div>
        ))}
      </section>
      <p className="text-xs text-ink-3">
        基于{' '}
        <a
          className="underline underline-offset-2"
          href={product.upstream}
          rel="noreferrer"
          target="_blank"
        >
          Dela
        </a>{' '}
        · GPL-3.0-or-later
      </p>
    </div>
  );
}
