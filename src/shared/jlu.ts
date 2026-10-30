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
    description: '查看学校通知与校务信息。',
    url: 'https://oa.jlu.edu.cn/defaultroot/login.jsp?access=oa',
    integration: 'pending',
  },
  {
    id: 'learning',
    name: '学在吉大',
    description: '查看课程回放与课表。',
    url: 'https://ilearntec.jlu.edu.cn/studycenter-web/index#/',
    integration: 'pending',
  },
] as const;

export type JluServiceId = (typeof jluServices)[number]['id'];
