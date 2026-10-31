import { useEffect, useState } from 'react';
import guide from '../../../../docs/user-guide.md?raw';
import { Button } from '../../components/ui/button';
import { LegalMarkdown } from '../../components/legal-markdown';
import { SectionHeader } from '../settings/SectionHeader';
import { useNavigationStore } from '../../navigation/view';
import { PlatformConnections } from './PlatformConnections';

export function SetupGuideSection() {
  const [model, setModel] = useState('正在读取本机模型配置…');
  useEffect(() => {
    let active = true;
    if (!window.dela) {
      setModel('请在桌面应用中配置模型');
      return;
    }
    void window.dela.llm
      .list()
      .then((rows) => {
        if (active)
          setModel(
            rows.some((row) => row.enabled && row.models.length)
              ? '已有模型配置；连通性请在模型设置中检测'
              : '尚未配置模型；本地阅读和校园同步仍可使用',
          );
      })
      .catch(() => {
        if (active) setModel('无法读取模型配置，请打开模型设置查看');
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="grid gap-8" data-setting-id="guide">
      <SectionHeader title="使用指南" description="按需完成配置，随时回到这里检查与连接。" />
      <section className="grid gap-3">
        <h2 className="text-base font-semibold text-ink">开始学习</h2>
        <p className="text-13 text-ink-3">{model}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => useNavigationStore.getState().navigate('knowledge')}>
            连接本地知识库
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => useNavigationStore.getState().openSettings('providers')}
          >
            配置模型
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => useNavigationStore.getState().openSettings('skills')}
          >
            可选文档组件
          </Button>
        </div>
      </section>
      <PlatformConnections />
      <article
        className="min-w-0 text-13 leading-relaxed text-ink-2 [&_ol]:mt-3 [&_ol]:grid [&_ol]:list-decimal [&_ol]:gap-1.5 [&_ol]:pl-4"
        aria-label="使用指南正文"
      >
        <LegalMarkdown markdown={guide} />
      </article>
    </div>
  );
}
