import { copyFileToProjectTool } from './copy-file';
import { createEntryTool, removeEntryTool, updateEntryTool } from './entries';
import { listWorkspaceEntriesTool } from './list-entries';

export const workspaceTools = {
  list_workspace_entries: listWorkspaceEntriesTool,
  create_entry: createEntryTool,
  update_entry: updateEntryTool,
  remove_entry: removeEntryTool,
  copy_file_to_project: copyFileToProjectTool,
};
