import { describe, expect, it } from 'vitest';
import { fileFormatOf } from './files';

const text = new TextEncoder().encode('A=1\n');

describe('文档格式判定', () => {
  it.each([
    '.env',
    '.env.example',
    '.env.local',
    '.gitignore',
    'Makefile',
    'Dockerfile',
    'LICENSE',
    'README',
  ])('%s 按文本处理', (name) => {
    expect(fileFormatOf(name, text)).toBe('text');
  });

  it('点文件路径按文件名判断', () => {
    expect(fileFormatOf('/home/u/proj/.env.example', text)).toBe('text');
  });

  it('已有格式不受文本扩展名规则影响', () => {
    expect(fileFormatOf('README.md', text)).toBe('markdown');
    expect(fileFormatOf('logo.png', text)).toBe('image');
    expect(fileFormatOf('manual.pdf', text)).toBe('pdf');
    expect(fileFormatOf('report.docx', text)).toBe('docx');
  });

  it('未知扩展由实际内容区分文本与二进制', () => {
    expect(fileFormatOf('archive.bin', text)).toBe('text');
    expect(fileFormatOf('archive.bin', Uint8Array.of(0, 1))).toBe('binary');
  });
});
