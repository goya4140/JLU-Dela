export const jluServices = [
  {
    id: 'academic',
    name: '吉林大学教务系统',
    description: '同步本科课表；成绩与培养方案请前往学校平台。',
    url: 'https://iedu.jlu.edu.cn/jwapp/sys/emaphome/portal/index.do',
    integration: 'preview',
  },
  {
    id: 'notices',
    name: '吉林大学电子校务平台',
    description: '读取校内通知、正文和附件入口。',
    url: 'https://oa.jlu.edu.cn/defaultroot/login.jsp?access=oa',
    integration: 'preview',
  },
  {
    id: 'learning',
    name: '学在吉大',
    description: '同步课程与回放，在应用内播放、查看字幕并记笔记。',
    url: 'https://ilearntec.jlu.edu.cn/studycenter-web/index#/',
    integration: 'preview',
  },
] as const;

export type JluServiceId = (typeof jluServices)[number]['id'];
