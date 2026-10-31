import { z } from 'zod';
import { knowledgeState, searchKnowledge } from '../../knowledge/api';
import { tool } from './shared';
export const knowledgeTools = {
  query_knowledge_courses: tool(
    '列出用户已连接的本地知识库与课程，不联网、不复制资料。',
    z.object({}).strict(),
    knowledgeState,
  ),
  search_knowledge: tool(
    '在指定知识库课程内检索文件名、2MB 内 Markdown/TXT 正文，以及仍有效的已提取 PDF 页码文本。最多 50 条，不含未解析 Office、扫描件正文和未提取 PDF 正文；片段不是完整材料。',
    z.object({ courseId: z.string().uuid(), query: z.string().trim().min(1).max(200) }).strict(),
    ({ courseId, query }) => searchKnowledge(courseId, query),
  ),
};
