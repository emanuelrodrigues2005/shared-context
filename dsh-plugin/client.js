window.__ModuleLoader__.load({
  id: 'dsh-plugin-shared-context',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useRef, useState } = React;

    const NS = 'sharedContext';
    const PANEL_ID = 'shared-context';
    /** Stable Host mount; the boot global only supplies the daemon origin. */
    const PROXY_ROUTE = '/shared-context';
    const PROJECT_STORAGE_KEY = 'dsh.shared-context.project';
    const CLOSED_STORAGE_KEY = 'dsh.shared-context.include-closed';
    const STAGES = ['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled'];
    const PRIORITIES = ['urgent', 'high', 'medium', 'low', 'none'];

    const STAGE_LABEL = {
      backlog: 'stage.backlog',
      todo: 'stage.todo',
      in_progress: 'stage.in_progress',
      review: 'stage.review',
      done: 'stage.done',
      cancelled: 'stage.cancelled',
    };

    const ACTIVITY_LABEL = {
      'issue.created': 'activity.created',
      'issue.updated': 'activity.updated',
      'issue.moved': 'activity.moved',
      'issue.stage_changed': 'activity.moved',
      'issue.blocked': 'activity.blocked',
      'issue.unblocked': 'activity.unblocked',
      'issue.deleted': 'activity.deleted',
      'issue.restored': 'activity.restored',
      'comment.created': 'activity.comment',
      'comment.updated': 'activity.comment',
      'comment.deleted': 'activity.comment',
      'attachment.added': 'activity.attachment',
      'attachment.removed': 'activity.attachment',
      'link.added': 'activity.link',
      'link.removed': 'activity.link',
    };

    const en = {
      panel: 'Issues',
      title: 'Shared Context',
      projects: 'Projects',
      search: 'Search issues',
      showClosed: 'Closed',
      refresh: 'Refresh',
      newIssue: 'New issue',
      openApp: 'Open full app',
      loading: 'Loading…',
      retry: 'Retry',
      close: 'Close',
      'status.online': 'online',
      'status.connecting': 'connecting',
      'status.offline': 'offline',
      'offline.title': 'Shared Context daemon is not reachable',
      'offline.body': 'Start it with "npm start" or the SharedContext logon task, then retry.',
      'projects.error': 'Could not load Projects.',
      'board.error': 'Could not load the board.',
      'board.empty': 'Nothing here yet.',
      'board.moveConflict': 'The Issue changed while moving; the board was refreshed.',
      'noProjects.title': 'No Projects yet',
      'noProjects.body': 'Create a Project in the full Shared Context app, then come back.',
      unassigned: 'Unassigned',
      blocked: 'Blocked',
      comments: 'Comments',
      activity: 'Activity',
      attachments: 'Attachments',
      links: 'Links',
      children: 'Children',
      description: 'Description',
      noDescription: 'No description.',
      'empty.comments': 'No comments yet.',
      'empty.activity': 'No activity recorded.',
      'empty.attachments': 'No attachments.',
      'empty.links': 'No links.',
      'empty.children': 'No child issues.',
      created: 'Created',
      updated: 'Updated',
      stage: 'Stage',
      priority: 'Priority',
      assignee: 'Assignee',
      module: 'Module',
      parent: 'Parent',
      'field.none': 'None',
      'comment.placeholder': 'Write a comment…',
      'comment.submit': 'Comment',
      'comment.submitting': 'Posting…',
      'create.title': 'New Issue',
      'create.titleField': 'Title',
      'create.titlePlaceholder': 'What needs to happen?',
      'create.descriptionField': 'Description',
      'create.descriptionPlaceholder': 'Optional context for whoever picks this up.',
      'create.stage': 'Stage',
      'create.priority': 'Priority',
      'create.submit': 'Create issue',
      'create.cancel': 'Cancel',
      'create.creating': 'Creating…',
      'create.required': 'A title is required.',
      'detail.loading': 'Loading Issue…',
      'detail.error': 'Could not load this Issue.',
      'action.failed': 'The change did not go through.',
      'count.more': 'more than shown',
      'stage.backlog': 'Backlog',
      'stage.todo': 'To do',
      'stage.in_progress': 'In progress',
      'stage.review': 'Review',
      'stage.done': 'Done',
      'stage.cancelled': 'Cancelled',
      'priority.urgent': 'Urgent',
      'priority.high': 'High',
      'priority.medium': 'Medium',
      'priority.low': 'Low',
      'priority.none': 'None',
      'activity.created': 'created this Issue',
      'activity.updated': 'updated this Issue',
      'activity.moved': 'changed the Stage',
      'activity.blocked': 'marked it Blocked',
      'activity.unblocked': 'removed the Blocked flag',
      'activity.deleted': 'deleted this Issue',
      'activity.restored': 'restored this Issue',
      'activity.comment': 'commented',
      'activity.attachment': 'changed attachments',
      'activity.link': 'changed links',
      'activity.other': 'changed this Issue',
    };

    const zh = {
      panel: 'Issues',
      title: '共享上下文',
      projects: '项目',
      search: '搜索 Issue',
      showClosed: '已关闭',
      refresh: '刷新',
      newIssue: '新建 Issue',
      openApp: '打开完整应用',
      loading: '加载中…',
      retry: '重试',
      close: '关闭',
      'status.online': '在线',
      'status.connecting': '连接中',
      'status.offline': '离线',
      'offline.title': '无法连接 Shared Context 服务',
      'offline.body': '请先运行 "npm start" 或启动 SharedContext 登录任务，然后重试。',
      'projects.error': '加载项目失败。',
      'board.error': '加载看板失败。',
      'board.empty': '这里还没有内容。',
      'board.moveConflict': '移动时 Issue 已发生变化，看板已刷新。',
      'noProjects.title': '还没有项目',
      'noProjects.body': '请在完整的 Shared Context 应用中创建项目，然后返回这里。',
      unassigned: '未指派',
      blocked: '阻塞',
      comments: '评论',
      activity: '活动',
      attachments: '附件',
      links: '链接',
      children: '子 Issue',
      description: '描述',
      noDescription: '暂无描述。',
      'empty.comments': '还没有评论。',
      'empty.activity': '还没有活动记录。',
      'empty.attachments': '没有附件。',
      'empty.links': '没有链接。',
      'empty.children': '没有子 Issue。',
      created: '创建于',
      updated: '更新于',
      stage: '阶段',
      priority: '优先级',
      assignee: '指派给',
      module: '模块',
      parent: '父 Issue',
      'field.none': '无',
      'comment.placeholder': '写一条评论…',
      'comment.submit': '评论',
      'comment.submitting': '提交中…',
      'create.title': '新建 Issue',
      'create.titleField': '标题',
      'create.titlePlaceholder': '需要完成什么？',
      'create.descriptionField': '描述',
      'create.descriptionPlaceholder': '可选的上下文信息。',
      'create.stage': '阶段',
      'create.priority': '优先级',
      'create.submit': '创建 Issue',
      'create.cancel': '取消',
      'create.creating': '创建中…',
      'create.required': '标题不能为空。',
      'detail.loading': '正在加载 Issue…',
      'detail.error': '无法加载这个 Issue。',
      'action.failed': '更改未生效。',
      'count.more': '数量超过显示上限',
      'stage.backlog': '待办池',
      'stage.todo': '待处理',
      'stage.in_progress': '进行中',
      'stage.review': '评审中',
      'stage.done': '已完成',
      'stage.cancelled': '已取消',
      'priority.urgent': '紧急',
      'priority.high': '高',
      'priority.medium': '中',
      'priority.low': '低',
      'priority.none': '无',
      'activity.created': '创建了此 Issue',
      'activity.updated': '更新了此 Issue',
      'activity.moved': '更改了阶段',
      'activity.blocked': '标记为阻塞',
      'activity.unblocked': '取消了阻塞标记',
      'activity.deleted': '删除了此 Issue',
      'activity.restored': '恢复了此 Issue',
      'activity.comment': '发表了评论',
      'activity.attachment': '更改了附件',
      'activity.link': '更改了链接',
      'activity.other': '更改了此 Issue',
    };

    const CSS = `
.sc-page{flex:1 1 auto;height:100%;min-height:0;display:flex;flex-direction:column;position:relative;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:inherit}
.sc-page *{box-sizing:border-box}
.sc-header{display:flex;align-items:flex-start;gap:16px;padding:18px 24px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);flex:none}
.sc-header button,.sc-header input,.sc-header a,.sc-header label{-webkit-app-region:no-drag}
.sc-heading{flex:1;min-width:0}
.sc-title{margin:0;font-size:19px;font-weight:600;letter-spacing:-.01em;line-height:1.25}
.sc-subtitle{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-top:5px;font-size:12px;color:var(--dsw-alias-label-secondary);min-height:16px}
.sc-sep{opacity:.45}
.sc-dot{width:7px;height:7px;border-radius:50%;flex:none;background:var(--dsw-alias-state-idle-primary)}
.sc-dot.is-online{background:var(--dsw-alias-state-success-primary)}
.sc-dot.is-offline{background:var(--dsw-alias-state-error-primary)}
.sc-actions{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:6px;max-width:64%}
@media (max-width:1100px){.sc-header{flex-wrap:wrap}.sc-actions{max-width:100%;justify-content:flex-start}}
.sc-search{height:30px;width:188px;padding:0 10px;border-radius:7px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;font-size:12px;outline:none}
.sc-search:focus{border-color:var(--dsw-alias-brand-primary)}
.sc-toggle{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap;cursor:pointer;padding:0 2px}
.sc-button{display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 10px;border-radius:7px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;font-size:12px;line-height:1;cursor:pointer;text-decoration:none;white-space:nowrap}
.sc-button:hover{border-color:var(--dsw-alias-border-l2)}
.sc-button:disabled{opacity:.5;cursor:default}
.sc-button.is-primary{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);background:transparent}
.sc-banner{display:flex;align-items:center;gap:10px;margin:10px 24px 0;padding:10px 12px;border-radius:8px;border:1px solid var(--dsw-alias-state-warn-primary);background:var(--dsw-alias-bg-layer-1);font-size:12px;flex:none}
.sc-banner.is-error{border-color:var(--dsw-alias-state-error-primary)}
.sc-bannerBody{flex:1;min-width:0;line-height:1.45}
.sc-bannerTitle{font-weight:600;margin:0 0 2px}
.sc-bannerBody p{margin:0;color:var(--dsw-alias-label-secondary)}
.sc-projects{display:flex;align-items:center;gap:6px;padding:10px 24px 0;overflow-x:auto;flex:none;scrollbar-width:thin}
.sc-project{height:26px;padding:0 10px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center}
.sc-project:hover{border-color:var(--dsw-alias-border-l2)}
.sc-project[aria-pressed=true]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.sc-projectCount{margin-left:6px;font-size:10.5px;opacity:.7;font-variant-numeric:tabular-nums}
.sc-board{flex:1;min-height:0;display:flex;align-items:flex-start;gap:12px;overflow-x:auto;overflow-y:hidden;padding:12px 24px 20px;scrollbar-width:thin}
.sc-column{display:flex;flex-direction:column;min-height:0;max-height:100%;width:262px;min-width:262px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);overflow:hidden}
.sc-columnHead{display:flex;align-items:center;gap:6px;padding:9px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--dsw-alias-label-secondary);flex:none}
.sc-count{margin-left:auto;padding:1px 6px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);font-size:10.5px;letter-spacing:0;text-transform:none;font-variant-numeric:tabular-nums}
.sc-columnBody{display:flex;flex-direction:column;gap:8px;padding:8px;min-height:72px;overflow-y:auto;scrollbar-width:thin}
.sc-emptyColumn{padding:12px 10px;border:1px dashed var(--dsw-alias-border-l1);border-radius:8px;font-size:12px;color:var(--dsw-alias-label-secondary);text-align:center}
.sc-card{position:relative;display:block;width:100%;text-align:left;padding:9px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:inherit;font:inherit;cursor:pointer}
.sc-card:hover{border-color:var(--dsw-alias-border-l2)}
.sc-card:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.sc-card.has-module-color::before{content:'';position:absolute;top:7px;bottom:7px;left:0;width:3px;border-radius:0 3px 3px 0;background:var(--sc-module-color);pointer-events:none}
.sc-card[draggable=true]{cursor:grab}
.sc-card[draggable=true]:active{cursor:grabbing}
.sc-card.is-dragging{opacity:.4}
.sc-card.is-dropBefore{box-shadow:inset 0 2px 0 var(--dsw-alias-brand-primary)}
.sc-column.is-dropTarget{border-color:var(--dsw-alias-brand-primary)}
.sc-columnBody.is-dropEnd{box-shadow:inset 0 -2px 0 var(--dsw-alias-brand-primary)}
.sc-cardTop{display:flex;align-items:center;gap:6px;min-height:16px;font-size:11px;color:var(--dsw-alias-label-secondary);min-width:0}
.sc-key{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:600;font-size:10.5px}
.sc-priority{padding:1px 5px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}
.sc-priority.is-urgent,.sc-priority.is-high{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.sc-priority.is-medium{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary)}
.sc-flag{display:inline-flex;align-items:center;gap:3px;font-size:10px;color:var(--dsw-alias-state-error-primary);white-space:nowrap}
.sc-time{margin-left:auto;font-size:10px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.sc-cardTitle{margin:6px 0 0;font-size:12.5px;line-height:1.35;font-weight:500;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.sc-cardMeta{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-top:7px;font-size:10.5px;color:var(--dsw-alias-label-secondary);min-height:14px;min-width:0}
.sc-avatar{width:16px;height:16px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:7.5px;font-weight:600;border:1px solid var(--dsw-alias-border-l1);flex:none}
.sc-assignee{display:inline-flex;align-items:center;gap:4px;min-width:0;max-width:112px}
.sc-assignee span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sc-chip{max-width:104px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:1px 6px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);font-size:10px}
.sc-metrics{margin-left:auto;display:inline-flex;align-items:center;gap:7px;font-variant-numeric:tabular-nums}
.sc-metric{display:inline-flex;align-items:center;gap:2px}
.sc-progress{height:3px;border-radius:999px;background:var(--dsw-alias-border-l1);overflow:hidden;margin-top:6px}
.sc-progressFill{height:100%;background:var(--dsw-alias-brand-primary);border-radius:999px}
.sc-loading{padding:24px 0;font-size:13px;color:var(--dsw-alias-label-secondary)}
.sc-emptyState{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:40px 24px;text-align:center}
.sc-emptyTitle{margin:0;font-size:15px;font-weight:600}
.sc-emptyBody{margin:0;font-size:12.5px;color:var(--dsw-alias-label-secondary);max-width:440px;line-height:1.5}
.sc-drawerLayer{position:absolute;inset:0;z-index:30;display:flex;justify-content:flex-end;background:color-mix(in srgb,var(--dsw-alias-label-primary) 16%,transparent)}
.sc-drawer{width:min(520px,94%);height:100%;display:flex;flex-direction:column;min-width:0;background:var(--dsw-alias-bg-layer-1);border-left:1px solid var(--dsw-alias-border-l1)}
.sc-drawerHead{display:flex;align-items:flex-start;gap:10px;padding:14px 16px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}
.sc-drawerTitle{margin:6px 0 0;font-size:15px;line-height:1.35;font-weight:600;overflow-wrap:anywhere}
.sc-drawerBody{flex:1;min-height:0;overflow-y:auto;padding:14px 16px 24px;display:flex;flex-direction:column;gap:16px;scrollbar-width:thin}
.sc-iconButton{width:28px;height:28px;border-radius:6px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex:none;padding:0}
.sc-iconButton:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.sc-fieldGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px}
.sc-field{min-width:0}
.sc-fieldLabel{margin-bottom:3px;font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.sc-fieldValue{font-size:12.5px;overflow-wrap:anywhere}
.sc-sectionTitle{margin:0 0 6px;font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.sc-prose{margin:0;font-size:13px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}
.sc-muted{margin:0;font-size:12px;color:var(--dsw-alias-label-secondary)}
.sc-list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
.sc-listItem{display:flex;align-items:baseline;gap:6px;font-size:12.5px;min-width:0}
.sc-listItem a{color:var(--dsw-alias-brand-primary);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sc-listItem a:hover{text-decoration:underline}
.sc-listItem .sc-key{flex:none}
.sc-comment{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px 10px;background:var(--dsw-alias-bg-base)}
.sc-commentHead{display:flex;align-items:baseline;gap:6px;margin-bottom:4px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.sc-commentAuthor{font-weight:600;color:var(--dsw-alias-label-primary)}
.sc-commentBody{margin:0;font-size:12.5px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
.sc-textarea{width:100%;min-height:62px;resize:vertical;padding:8px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:inherit;font:inherit;font-size:12.5px;line-height:1.45;outline:none}
.sc-textarea:focus{border-color:var(--dsw-alias-brand-primary)}
.sc-rowActions{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:8px}
.sc-select{height:30px;padding:0 8px;border-radius:7px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;font-size:12px;outline:none;max-width:100%}
.sc-select:focus{border-color:var(--dsw-alias-brand-primary)}
.sc-errorText{margin:0;font-size:12px;color:var(--dsw-alias-state-error-primary)}
.sc-modalLayer{position:absolute;inset:0;z-index:40;display:flex;align-items:flex-start;justify-content:center;padding:10vh 20px 20px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 16%,transparent)}
.sc-modal{width:min(520px,100%);max-height:80vh;display:flex;flex-direction:column;overflow:hidden;border-radius:12px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay)}
.sc-modalHead{display:flex;align-items:center;gap:10px;padding:13px 16px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}
.sc-modalTitle{margin:0;font-size:15px;font-weight:600;flex:1}
.sc-modalBody{display:flex;flex-direction:column;gap:10px;padding:14px 16px;overflow-y:auto}
.sc-modalFoot{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid var(--dsw-alias-border-l1);flex:none}
.sc-label{display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.sc-input{height:32px;width:100%;padding:0 10px;border-radius:7px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:inherit;font:inherit;font-size:13px;outline:none}
.sc-input:focus{border-color:var(--dsw-alias-brand-primary)}
.sc-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.sc-activity{display:flex;flex-direction:column;gap:7px}
.sc-activityItem{display:flex;gap:7px;font-size:12px;line-height:1.45;color:var(--dsw-alias-label-secondary)}
.sc-activityDot{width:5px;height:5px;border-radius:50%;background:var(--dsw-alias-border-l2);margin-top:6px;flex:none}
.sc-activityText{min-width:0}
.sc-activityText strong{color:var(--dsw-alias-label-primary);font-weight:600}
.sc-srOnly{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
`;
    // Trim the leading indentation once so the stylesheet stays readable in source.
    const STYLE = CSS.replace(/^[ \t]+/gm, '');

    /**
     * Read the Host-published boot payload.
     *
     * The proxy route is fixed so a page that predates a plugin reload still
     * reaches the current mount; only the daemon origin comes from the payload.
     *
     * @returns {{route: string, baseUrl: string}} proxy mount and daemon origin.
     */
    function bootConfig() {
      const config = globalThis.__DSH_SHARED_CONTEXT__;
      return {
        route: PROXY_ROUTE,
        baseUrl:
          config && typeof config.baseUrl === 'string'
            ? config.baseUrl
            : 'http://127.0.0.1:4319',
      };
    }

    function readStoredProject() {
      try {
        return window.localStorage.getItem(PROJECT_STORAGE_KEY);
      } catch {
        return null;
      }
    }

    function storeProject(key) {
      try {
        window.localStorage.setItem(PROJECT_STORAGE_KEY, key);
      } catch {
        /* storage can be unavailable; the selection is then per visit */
      }
    }

    /** Read the persisted Closed-column toggle; defaults to hidden. */
    function readStoredClosed() {
      try {
        return window.localStorage.getItem(CLOSED_STORAGE_KEY) === '1';
      } catch {
        return false;
      }
    }

    /** Persist the Closed-column toggle so it survives panel switches. */
    function storeClosed(value) {
      try {
        window.localStorage.setItem(CLOSED_STORAGE_KEY, value ? '1' : '0');
      } catch {
        /* storage can be unavailable; the toggle is then per visit */
      }
    }

    class ApiError extends Error {
      constructor(status, code, message) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
      }
    }

    /**
     * Call the proxy. The Host half adds the daemon's CSRF token for mutations.
     * @param {string} path - daemon path below the proxy mount.
     * @param {{method?: string, body?: unknown}} [options] - request options.
     * @returns {Promise<any>} the decoded JSON payload.
     */
    async function api(path, options = {}) {
      const { route } = bootConfig();
      const method = options.method ?? 'GET';
      const headers = { accept: 'application/json', 'x-dsh-shared-context': '1' };
      if (options.body !== undefined) headers['content-type'] = 'application/json';
      const response = await fetch(`${route}${path}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new ApiError(
          response.status,
          payload && payload.error && payload.error.code ? payload.error.code : 'http_error',
          payload && payload.error && payload.error.message
            ? payload.error.message
            : `HTTP ${response.status}`,
        );
      }
      if (payload === null) {
        throw new ApiError(
          response.status,
          'invalid_response',
          'The Shared Context proxy answered with a non-JSON response; reload the page.',
        );
      }
      return payload;
    }

    const RTF =
      typeof Intl !== 'undefined' && typeof Intl.RelativeTimeFormat === 'function'
        ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'narrow' })
        : null;

    function relativeTime(value) {
      const time = Date.parse(value);
      if (!Number.isFinite(time)) return '';
      const delta = Math.round((time - Date.now()) / 1000);
      const units = [
        ['year', 31536000],
        ['month', 2592000],
        ['week', 604800],
        ['day', 86400],
        ['hour', 3600],
        ['minute', 60],
      ];
      for (const [unit, seconds] of units) {
        if (Math.abs(delta) >= seconds) {
          const amount = Math.round(delta / seconds);
          return RTF ? RTF.format(amount, unit) : `${String(amount)} ${unit}`;
        }
      }
      return RTF ? RTF.format(0, 'second') : 'now';
    }

    function formatDateTime(value) {
      const time = Date.parse(value);
      if (!Number.isFinite(time)) return '';
      return new Date(time).toLocaleString();
    }

    function formatBytes(bytes) {
      if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '';
      if (bytes < 1024) return `${String(bytes)} B`;
      const units = ['KB', 'MB', 'GB'];
      let size = bytes / 1024;
      let index = 0;
      while (size >= 1024 && index < units.length - 1) {
        size /= 1024;
        index += 1;
      }
      return `${size.toFixed(size >= 100 ? 0 : 1)} ${units[index]}`;
    }

    function initials(name) {
      return String(name ?? '')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join('')
        .slice(0, 2);
    }

    /**
     * Accept only CSS hex notation for a Module accent. Module colors come from
     * the standalone app's color input; anything else is ignored rather than
     * fed into `background` as an arbitrary CSS value.
     *
     * @param {unknown} value - the Module's stored color.
     * @returns {string | null} a safe hex color, or null.
     */
    function normalizeModuleColor(value) {
      if (typeof value !== 'string') return null;
      const color = value.trim();
      return /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) ? color : null;
    }

    function appPath(path) {
      const { baseUrl } = bootConfig();
      return `${baseUrl}${path}`;
    }

    function issueAppPath(issue) {
      const projectKey = issue && issue.project ? issue.project.key : '';
      return appPath(`/projects/${encodeURIComponent(projectKey)}/issues/${encodeURIComponent(issue.key)}`);
    }

    function boardAppPath(projectKey) {
      return appPath(`/projects/${encodeURIComponent(projectKey)}/board`);
    }

    function changeSummary(changes) {
      if (!Array.isArray(changes)) return '';
      return changes
        .filter((change) => change && typeof change.field === 'string' && change.field !== 'snapshot')
        .map((change) => `${change.field}: ${formatChangeValue(change.from)} → ${formatChangeValue(change.to)}`)
        .join(' · ');
    }

    function formatChangeValue(value) {
      if (value === null || value === undefined) return '—';
      if (typeof value === 'object') return '[object]';
      return String(value);
    }

    /**
     * Position for a card dropped at `overIndex` in `issues`, mirroring the
     * standalone board's 1024 spacing: before the first, after the last, or
     * halfway between the two neighbours.
     *
     * @param {Array<{position:number}>} issues - target column without the dragged card.
     * @param {number} overIndex - insertion index in that list.
     * @returns {number} the persisted position value.
     */
    function computeDropPosition(issues, overIndex) {
      if (issues.length === 0) return 1024;
      if (overIndex <= 0) return issues[0].position - 1024;
      if (overIndex >= issues.length) return issues[issues.length - 1].position + 1024;
      const before = issues[overIndex - 1];
      const after = issues[overIndex];
      return (before.position + after.position) / 2;
    }

    /**
     * Apply one optimistic move to a BoardResult, keeping the column order and
     * its displayed count in sync with the server's `sort=position` ordering.
     *
     * @param {object} board - current board payload.
     * @param {object} issue - the moved card as currently rendered.
     * @param {string} stage - target Stage.
     * @param {number} position - target position.
     * @returns {object} the updated board payload.
     */
    function moveIssueInBoard(board, issue, stage, position) {
      const moved = { ...issue, stage, position };
      const columns = board.columns.map((column) => {
        const issues = column.issues.filter((entry) => entry.id !== issue.id);
        if (column.stage === stage) {
          issues.push(moved);
          issues.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
        }
        return { ...column, issues, count: issues.length };
      });
      return { ...board, columns };
    }

    /**
     * Patch one card in place after the daemon confirms a move, so a second
     * drag before the refetch settles carries the fresh revision.
     *
     * @param {object} board - current board payload.
     * @param {string} issueId - Issue id to patch.
     * @param {object} patch - card fields to merge.
     * @returns {object} the updated board payload.
     */
    function patchBoardIssue(board, issueId, patch) {
      return {
        ...board,
        columns: board.columns.map((column) => ({
          ...column,
          issues: column.issues.map((entry) => (entry.id === issueId ? { ...entry, ...patch } : entry)),
        })),
      };
    }

    /* ── icons ─────────────────────────────────────────────────────────────── */

    function IconFrame({ size, children }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          focusable: 'false',
          style: { display: 'block', flex: 'none' },
        },
        children,
      );
    }

    function IconRefresh({ size = 14 }) {
      return h(IconFrame, { size }, h('path', { d: 'M13.2 8a5.2 5.2 0 1 1-1.6-3.75' }), h('path', { d: 'M13.2 2.6v3.2h-3.2' }));
    }

    function IconPlus({ size = 14 }) {
      return h(IconFrame, { size }, h('path', { d: 'M8 3.2v9.6' }), h('path', { d: 'M3.2 8h9.6' }));
    }

    function IconExternal({ size = 14 }) {
      return h(
        IconFrame,
        { size },
        h('path', { d: 'M6.4 3.2H3.2v9.6h9.6V9.6' }),
        h('path', { d: 'M9.2 3.2h3.6v3.6' }),
        h('path', { d: 'M12.8 3.2 7.6 8.4' }),
      );
    }

    function IconClose({ size = 14 }) {
      return h(IconFrame, { size }, h('path', { d: 'M3.6 3.6l8.8 8.8' }), h('path', { d: 'M12.4 3.6l-8.8 8.8' }));
    }

    function IconComment({ size = 11 }) {
      return h(
        IconFrame,
        { size },
        h('path', { d: 'M13 9.2a1.8 1.8 0 0 1-1.8 1.8H5.4L2.8 13V3.8A1.8 1.8 0 0 1 4.6 2h6.6A1.8 1.8 0 0 1 13 3.8z' }),
      );
    }

    function IconPaperclip({ size = 11 }) {
      return h(
        IconFrame,
        { size },
        h('path', { d: 'M11.7 7.3 8 11a2.6 2.6 0 0 1-3.7-3.7l4.4-4.4a1.8 1.8 0 0 1 2.6 2.6L7 9.9a.9.9 0 0 1-1.3-1.3l3.8-3.8' }),
      );
    }

    function IconBranch({ size = 11 }) {
      return h(
        IconFrame,
        { size },
        h('circle', { cx: 4.2, cy: 3.4, r: 1.6 }),
        h('circle', { cx: 4.2, cy: 12.6, r: 1.6 }),
        h('circle', { cx: 11.8, cy: 5, r: 1.6 }),
        h('path', { d: 'M4.2 5v6' }),
        h('path', { d: 'M11.8 6.6c0 2.4-2.2 2.6-4 3.2' }),
      );
    }

    function IconBan({ size = 11 }) {
      return h(IconFrame, { size }, h('circle', { cx: 8, cy: 8, r: 5.6 }), h('path', { d: 'M4.2 4.2l7.6 7.6' }));
    }

    function PanelIcon({ size = 16 }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          fill: 'currentColor',
          'aria-hidden': 'true',
          focusable: 'false',
          style: { display: 'block', flex: 'none' },
        },
        h('rect', { x: 1.6, y: 2.6, width: 3.3, height: 8.6, rx: 1.2 }),
        h('rect', { x: 6.35, y: 2.6, width: 3.3, height: 11, rx: 1.2, opacity: 0.72 }),
        h('rect', { x: 11.1, y: 2.6, width: 3.3, height: 5.8, rx: 1.2, opacity: 0.45 }),
      );
    }

    /* ── small presentational pieces ──────────────────────────────────────── */

    function PriorityChip({ t, priority }) {
      const key = PRIORITIES.includes(priority) ? priority : 'none';
      return h('span', { className: `sc-priority is-${key}` }, t(`priority.${key}`));
    }

    function Avatar({ actor }) {
      if (!actor) return null;
      const color = typeof actor.color === 'string' && actor.color !== '' ? actor.color : undefined;
      return h(
        'span',
        {
          className: 'sc-avatar',
          title: actor.name,
          style: color ? { color, borderColor: color } : undefined,
        },
        initials(actor.name),
      );
    }

    function IssueCardView({
      issue,
      t,
      onOpen,
      onDragStart,
      onDragEnd,
      onDragOver,
      onDrop,
      dropBefore = false,
      dragging = false,
      draggable = true,
    }) {
      const children = issue.child_progress || null;
      const childTotal = children ? children.total : 0;
      const childDone = children ? children.done + children.cancelled : 0;
      const percent = childTotal > 0 ? Math.round((childDone / childTotal) * 100) : 0;
      const moduleColor = normalizeModuleColor(issue.module && issue.module.color);
      return h(
        'div',
        {
          role: 'button',
          tabIndex: 0,
          className: `sc-card${dragging ? ' is-dragging' : ''}${dropBefore ? ' is-dropBefore' : ''}${moduleColor ? ' has-module-color' : ''}`,
          style: moduleColor ? { '--sc-module-color': moduleColor } : undefined,
          'data-issue-key': issue.key,
          draggable: draggable !== false,
          onDragStart: (event) => {
            if (typeof onDragStart === 'function') onDragStart(issue, event);
          },
          onDragEnd: (event) => {
            if (typeof onDragEnd === 'function') onDragEnd(event);
          },
          onDragOver: (event) => {
            if (typeof onDragOver !== 'function') return;
            event.preventDefault();
            event.stopPropagation();
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
            onDragOver(issue, event);
          },
          onDrop: (event) => {
            if (typeof onDrop !== 'function') return;
            event.preventDefault();
            event.stopPropagation();
            onDrop(issue, event);
          },
          onClick: () => onOpen(issue),
          onKeyDown: (event) => {
            if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
            event.preventDefault();
            onOpen(issue);
          },
        },
        h(
          'span',
          { className: 'sc-cardTop' },
          h('span', { className: 'sc-key' }, issue.key),
          h(PriorityChip, { t, priority: issue.priority }),
          issue.blocked
            ? h('span', { className: 'sc-flag', title: issue.blocked_reason || t('blocked') }, h(IconBan), t('blocked'))
            : null,
          h('span', { className: 'sc-time' }, relativeTime(issue.updated_at)),
        ),
        h('span', { className: 'sc-cardTitle' }, issue.title),
        h(
          'span',
          { className: 'sc-cardMeta' },
          issue.assignee
            ? h('span', { className: 'sc-assignee' }, h(Avatar, { actor: issue.assignee }), h('span', null, issue.assignee.name))
            : h('span', null, t('unassigned')),
          issue.module
            ? h('span', { className: 'sc-chip', title: issue.module.name }, issue.module.name)
            : null,
          h(
            'span',
            { className: 'sc-metrics' },
            issue.attachment_count > 0
              ? h('span', { className: 'sc-metric', title: t('attachments') }, h(IconPaperclip), String(issue.attachment_count))
              : null,
            issue.comment_count > 0
              ? h('span', { className: 'sc-metric', title: t('comments') }, h(IconComment), String(issue.comment_count))
              : null,
            childTotal > 0
              ? h('span', { className: 'sc-metric', title: t('children') }, h(IconBranch), `${String(childDone)}/${String(childTotal)}`)
              : null,
          ),
        ),
        childTotal > 0 ? h('span', { className: 'sc-progress' }, h('span', { className: 'sc-progressFill', style: { width: `${String(percent)}%` } })) : null,
      );
    }

    function BoardColumnView({
      column,
      t,
      onOpen,
      dragTarget = null,
      draggingKey = null,
      movingKeys = [],
      onCardDragStart,
      onCardDragEnd,
      onCardDragOver,
      onCardDrop,
      onColumnDragOver,
      onColumnDrop,
      onColumnDragLeave,
    }) {
      const isDropTarget = dragTarget !== null && dragTarget !== undefined && dragTarget.stage === column.stage;
      const overSelf = isDropTarget && dragTarget.issueId !== null && dragTarget.issueId === draggingKey;
      const overIssueId = isDropTarget && !overSelf ? dragTarget.issueId : null;
      const dropAtEnd = isDropTarget && !overSelf && (overIssueId === null || overIssueId === undefined);
      return h(
        'section',
        {
          className: `sc-column${isDropTarget ? ' is-dropTarget' : ''}`,
          'aria-label': t(STAGE_LABEL[column.stage] || 'stage.backlog'),
          onDragOver: (event) => {
            if (typeof onColumnDragOver !== 'function') return;
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
            onColumnDragOver(column.stage);
          },
          onDrop: (event) => {
            if (typeof onColumnDrop !== 'function') return;
            event.preventDefault();
            event.stopPropagation();
            onColumnDrop(column.stage);
          },
          onDragLeave: (event) => {
            if (typeof onColumnDragLeave !== 'function') return;
            try {
              if (event.relatedTarget !== null && event.currentTarget.contains(event.relatedTarget)) return;
            } catch {
              /* relatedTarget may be a non-Node target when the drag leaves the window */
            }
            onColumnDragLeave(column.stage);
          },
        },
        h(
          'header',
          { className: 'sc-columnHead' },
          h('span', null, t(STAGE_LABEL[column.stage] || 'stage.backlog')),
          h('span', { className: 'sc-count' }, String(column.count)),
        ),
        h(
          'div',
          { className: `sc-columnBody${dropAtEnd ? ' is-dropEnd' : ''}` },
          column.issues.length === 0
            ? h('div', { className: 'sc-emptyColumn' }, t('board.empty'))
            : column.issues.map((issue) =>
                h(IssueCardView, {
                  key: issue.key,
                  issue,
                  t,
                  onOpen,
                  dropBefore: overIssueId === issue.id,
                  dragging: draggingKey === issue.key,
                  draggable: !movingKeys.includes(issue.key),
                  onDragStart: onCardDragStart,
                  onDragEnd: onCardDragEnd,
                  onDragOver: (card) => {
                    if (typeof onCardDragOver === 'function') onCardDragOver(column.stage, card.id);
                  },
                  onDrop: (card) => {
                    if (typeof onCardDrop === 'function') onCardDrop(column.stage, card.id);
                  },
                }),
              ),
          column.has_more ? h('div', { className: 'sc-emptyColumn' }, t('count.more')) : null,
        ),
      );
    }

    function OfflineBanner({ t, message, onRetry }) {
      return h(
        'div',
        { className: 'sc-banner is-error', role: 'alert' },
        h(
          'div',
          { className: 'sc-bannerBody' },
          h('p', { className: 'sc-bannerTitle' }, t('offline.title')),
          h('p', null, t('offline.body')),
          message ? h('p', { style: { marginTop: '4px', opacity: 0.8 } }, message) : null,
        ),
        h('button', { type: 'button', className: 'sc-button', onClick: onRetry }, t('retry')),
      );
    }

    /* ── Issue drawer ─────────────────────────────────────────────────────── */

    function DetailDrawer({ t, state, onClose, onMove, onComment, busy, error }) {
      const issue = state.issue;
      const [draft, setDraft] = useState('');
      const composerRef = useRef(null);

      useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [onClose]);

      useEffect(() => {
        if (state.phase !== 'ready') return undefined;
        window.setTimeout(() => composerRef.current?.focus(), 40);
        return undefined;
      }, [state.phase, issue ? issue.key : '']);

      if (state.phase === 'loading' || (!issue && state.phase !== 'error')) {
        return h(
          'div',
          { className: 'sc-drawerLayer', onMouseDown: (event) => { if (event.target === event.currentTarget) onClose(); } },
          h(
            'div',
            { className: 'sc-drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('detail.loading') },
            h('div', { className: 'sc-drawerHead' }, h('div', { style: { flex: 1 } }, h('p', { className: 'sc-muted' }, t('detail.loading'))), h('button', { type: 'button', className: 'sc-iconButton', onClick: onClose, 'aria-label': t('close') }, h(IconClose))),
          ),
        );
      }

      if (state.phase === 'error' || !issue) {
        return h(
          'div',
          { className: 'sc-drawerLayer', onMouseDown: (event) => { if (event.target === event.currentTarget) onClose(); } },
          h(
            'div',
            { className: 'sc-drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('detail.error') },
            h('div', { className: 'sc-drawerHead' }, h('div', { style: { flex: 1 } }, h('p', { className: 'sc-errorText' }, t('detail.error')), h('p', { className: 'sc-muted' }, state.error || '')), h('button', { type: 'button', className: 'sc-iconButton', onClick: onClose, 'aria-label': t('close') }, h(IconClose))),
          ),
        );
      }

      const fields = [
        [t('assignee'), issue.assignee ? issue.assignee.name : t('field.none')],
        [t('module'), issue.module ? issue.module.name : t('field.none')],
        [t('parent'), issue.parent ? `${issue.parent.key} ${issue.parent.title}` : t('field.none')],
        [t('priority'), t(`priority.${PRIORITIES.includes(issue.priority) ? issue.priority : 'none'}`)],
        [t('created'), formatDateTime(issue.created_at)],
        [t('updated'), formatDateTime(issue.updated_at)],
      ];

      return h(
        'div',
        {
          className: 'sc-drawerLayer',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) onClose();
          },
        },
        h(
          'div',
          { className: 'sc-drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': `${issue.key} ${issue.title}` },
          h(
            'div',
            { className: 'sc-drawerHead' },
            h(
              'div',
              { style: { flex: 1, minWidth: 0 } },
              h(
                'div',
                { className: 'sc-cardTop' },
                h('a', { className: 'sc-key', href: issueAppPath(issue), target: '_blank', rel: 'noreferrer' }, issue.key),
                h(PriorityChip, { t, priority: issue.priority }),
                issue.blocked ? h('span', { className: 'sc-flag' }, h(IconBan), t('blocked')) : null,
              ),
              h('h2', { className: 'sc-drawerTitle' }, issue.title),
            ),
            h('button', { type: 'button', className: 'sc-iconButton', onClick: onClose, 'aria-label': t('close') }, h(IconClose)),
          ),
          h(
            'div',
            { className: 'sc-drawerBody' },
            error ? h('p', { className: 'sc-errorText' }, `${t('action.failed')} ${error}`) : null,
            issue.blocked && issue.blocked_reason ? h('div', { className: 'sc-banner is-error', style: { margin: 0 } }, h('div', { className: 'sc-bannerBody' }, issue.blocked_reason)) : null,
            h(
              'section',
              null,
              h('h3', { className: 'sc-sectionTitle' }, t('stage')),
              h(
                'select',
                {
                  className: 'sc-select',
                  value: issue.stage,
                  disabled: busy,
                  'aria-label': t('stage'),
                  onChange: (event) => onMove(issue, event.target.value),
                },
                STAGES.map((stage) => h('option', { key: stage, value: stage }, t(STAGE_LABEL[stage]))),
              ),
            ),
            h(
              'section',
              null,
              h('h3', { className: 'sc-sectionTitle' }, t('description')),
              h('p', { className: 'sc-prose' }, issue.description && issue.description.trim() !== '' ? issue.description : t('noDescription')),
            ),
            h(
              'section',
              { className: 'sc-fieldGrid' },
              fields.map(([label, value]) => h('div', { className: 'sc-field', key: label }, h('div', { className: 'sc-fieldLabel' }, label), h('div', { className: 'sc-fieldValue' }, value))),
            ),
            issue.children && issue.children.length > 0
              ? h(
                  'section',
                  null,
                  h('h3', { className: 'sc-sectionTitle' }, t('children')),
                  h(
                    'ul',
                    { className: 'sc-list' },
                    issue.children.map((child) =>
                      h(
                        'li',
                        { className: 'sc-listItem', key: child.key },
                        h('span', { className: 'sc-key' }, child.key),
                        h('span', null, child.title),
                      ),
                    ),
                  ),
                )
              : null,
            issue.links && issue.links.length > 0
              ? h(
                  'section',
                  null,
                  h('h3', { className: 'sc-sectionTitle' }, t('links')),
                  h(
                    'ul',
                    { className: 'sc-list' },
                    issue.links.map((link) =>
                      h(
                        'li',
                        { className: 'sc-listItem', key: link.id },
                        h('a', { href: link.url, target: '_blank', rel: 'noreferrer', title: link.url }, link.label || link.url),
                      ),
                    ),
                  ),
                )
              : null,
            issue.attachments && issue.attachments.length > 0
              ? h(
                  'section',
                  null,
                  h('h3', { className: 'sc-sectionTitle' }, t('attachments')),
                  h(
                    'ul',
                    { className: 'sc-list' },
                    issue.attachments.map((attachment) =>
                      h(
                        'li',
                        { className: 'sc-listItem', key: attachment.id },
                        h(
                          'a',
                          {
                            href: `${bootConfig().route}/api/attachments/${encodeURIComponent(attachment.id)}/content`,
                            target: '_blank',
                            rel: 'noreferrer',
                          },
                          attachment.original_name,
                        ),
                        h('span', { className: 'sc-muted' }, formatBytes(attachment.size_bytes)),
                      ),
                    ),
                  ),
                )
              : null,
            h(
              'section',
              null,
              h('h3', { className: 'sc-sectionTitle' }, t('comments')),
              issue.comments && issue.comments.length > 0
                ? h(
                    'div',
                    { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                    issue.comments.map((comment) =>
                      h(
                        'div',
                        { className: 'sc-comment', key: comment.id },
                        h(
                          'div',
                          { className: 'sc-commentHead' },
                          h('span', { className: 'sc-commentAuthor' }, comment.author ? comment.author.name : ''),
                          h('span', null, relativeTime(comment.created_at)),
                        ),
                        h('p', { className: 'sc-commentBody' }, comment.body),
                      ),
                    ),
                  )
                : h('p', { className: 'sc-muted' }, t('empty.comments')),
              h(
                'div',
                { style: { marginTop: '10px' } },
                h('textarea', {
                  ref: composerRef,
                  className: 'sc-textarea',
                  value: draft,
                  placeholder: t('comment.placeholder'),
                  onChange: (event) => setDraft(event.target.value),
                }),
                h(
                  'div',
                  { className: 'sc-rowActions' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'sc-button is-primary',
                      disabled: busy || draft.trim() === '',
                      onClick: async () => {
                        const body = draft.trim();
                        if (body === '') return;
                        const ok = await onComment(issue, body);
                        if (ok) setDraft('');
                      },
                    },
                    busy ? t('comment.submitting') : t('comment.submit'),
                  ),
                ),
              ),
            ),
            issue.activity && issue.activity.length > 0
              ? h(
                  'section',
                  null,
                  h('h3', { className: 'sc-sectionTitle' }, t('activity')),
                  h(
                    'div',
                    { className: 'sc-activity' },
                    issue.activity.slice(0, 20).map((entry) =>
                      h(
                        'div',
                        { className: 'sc-activityItem', key: entry.id },
                        h('span', { className: 'sc-activityDot' }),
                        h(
                          'div',
                          { className: 'sc-activityText' },
                          h('strong', null, entry.actor_name || ''),
                          ' ',
                          t(ACTIVITY_LABEL[entry.type] || 'activity.other'),
                          h('span', { className: 'sc-muted' }, ` · ${relativeTime(entry.at)}`),
                          changeSummary(entry.changes) !== ''
                            ? h('div', { className: 'sc-muted', style: { marginTop: '2px' } }, changeSummary(entry.changes))
                            : null,
                        ),
                      ),
                    ),
                  ),
                )
              : h('section', null, h('h3', { className: 'sc-sectionTitle' }, t('activity')), h('p', { className: 'sc-muted' }, t('empty.activity'))),
          ),
        ),
      );
    }

    /* ── New Issue dialog ─────────────────────────────────────────────────── */

    function CreateIssueDialog({ t, projectName, busy, error, onClose, onSubmit }) {
      const [title, setTitle] = useState('');
      const [description, setDescription] = useState('');
      const [stage, setStage] = useState('backlog');
      const [priority, setPriority] = useState('none');
      const inputRef = useRef(null);

      useEffect(() => {
        inputRef.current?.focus();
        const onKey = (event) => {
          if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [onClose]);

      const canSubmit = title.trim() !== '' && !busy;

      return h(
        'div',
        { className: 'sc-modalLayer', onMouseDown: (event) => { if (event.target === event.currentTarget) onClose(); } },
        h(
          'form',
          {
            className: 'sc-modal',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': t('create.title'),
            onSubmit: (event) => {
              event.preventDefault();
              if (!canSubmit) return;
              onSubmit({ title: title.trim(), description: description.trim(), stage, priority });
            },
          },
          h(
            'div',
            { className: 'sc-modalHead' },
            h('h2', { className: 'sc-modalTitle' }, t('create.title')),
            projectName ? h('span', { className: 'sc-muted' }, projectName) : null,
            h('button', { type: 'button', className: 'sc-iconButton', onClick: onClose, 'aria-label': t('close') }, h(IconClose)),
          ),
          h(
            'div',
            { className: 'sc-modalBody' },
            error ? h('p', { className: 'sc-errorText' }, error) : null,
            h(
              'label',
              { className: 'sc-label' },
              t('create.titleField'),
              h('input', {
                ref: inputRef,
                className: 'sc-input',
                value: title,
                placeholder: t('create.titlePlaceholder'),
                onChange: (event) => setTitle(event.target.value),
              }),
            ),
            h(
              'label',
              { className: 'sc-label' },
              t('create.descriptionField'),
              h('textarea', {
                className: 'sc-textarea',
                value: description,
                placeholder: t('create.descriptionPlaceholder'),
                onChange: (event) => setDescription(event.target.value),
              }),
            ),
            h(
              'div',
              { className: 'sc-fields' },
              h(
                'label',
                { className: 'sc-label' },
                t('create.stage'),
                h(
                  'select',
                  { className: 'sc-select', value: stage, onChange: (event) => setStage(event.target.value) },
                  STAGES.map((value) => h('option', { key: value, value }, t(STAGE_LABEL[value]))),
                ),
              ),
              h(
                'label',
                { className: 'sc-label' },
                t('create.priority'),
                h(
                  'select',
                  { className: 'sc-select', value: priority, onChange: (event) => setPriority(event.target.value) },
                  PRIORITIES.map((value) => h('option', { key: value, value }, t(`priority.${value}`))),
                ),
              ),
            ),
            title.trim() === '' ? h('p', { className: 'sc-muted' }, t('create.required')) : null,
          ),
          h(
            'div',
            { className: 'sc-modalFoot' },
            h('button', { type: 'button', className: 'sc-button', onClick: onClose }, t('create.cancel')),
            h('button', { type: 'submit', className: 'sc-button is-primary', disabled: !canSubmit }, busy ? t('create.creating') : t('create.submit')),
          ),
        ),
      );
    }

    /* ── page ─────────────────────────────────────────────────────────────── */

    function Page(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key;
      const [connection, setConnection] = useState({ phase: 'loading', version: null, message: null });
      const [projects, setProjects] = useState({ phase: 'loading', items: [], error: null });
      const [projectKey, setProjectKey] = useState(readStoredProject);
      const [board, setBoard] = useState({ phase: 'idle', data: null, error: null });
      const [search, setSearch] = useState('');
      const [query, setQuery] = useState('');
      const [includeClosed, setIncludeClosed] = useState(readStoredClosed);
      const [tick, setTick] = useState(0);
      const [selectedKey, setSelectedKey] = useState(null);
      const [detail, setDetail] = useState({ phase: 'idle', issue: null, error: null });
      const [detailTick, setDetailTick] = useState(0);
      const [creating, setCreating] = useState(false);
      const [actionError, setActionError] = useState(null);
      const [busy, setBusy] = useState(false);
      const [movingKeys, setMovingKeys] = useState([]);
      const [dragTarget, setDragTarget] = useState(null);
      const [dragKey, setDragKey] = useState(null);
      const dragIssueRef = useRef(null);
      const suppressClickRef = useRef(false);
      const suppressTimerRef = useRef(null);

      const refresh = useCallback(() => setTick((value) => value + 1), []);

      useEffect(() => {
        let alive = true;
        api('/healthz')
          .then((payload) => {
            if (alive) setConnection({ phase: 'ready', version: payload && payload.version ? payload.version : null, message: null });
          })
          .catch((error) => {
            if (alive) setConnection({ phase: 'offline', version: null, message: error instanceof Error ? error.message : String(error) });
          });
        return () => {
          alive = false;
        };
      }, [tick]);

      useEffect(() => {
        let alive = true;
        api('/api/projects')
          .then((payload) => {
            if (alive) setProjects({ phase: 'ready', items: payload && Array.isArray(payload.items) ? payload.items : [], error: null });
          })
          .catch((error) => {
            if (alive) setProjects({ phase: 'error', items: [], error: error instanceof Error ? error.message : String(error) });
          });
        return () => {
          alive = false;
        };
      }, [tick]);

      useEffect(() => {
        if (projects.phase !== 'ready') return;
        const keys = projects.items.map((project) => project.key);
        if (projectKey !== null && keys.includes(projectKey)) return;
        const next = keys.length > 0 ? keys[0] : null;
        setProjectKey(next);
        if (next !== null) storeProject(next);
      }, [projects, projectKey]);

      useEffect(() => {
        if (projectKey === null) {
          setBoard({ phase: 'idle', data: null, error: null });
          return undefined;
        }
        let alive = true;
        setBoard((previous) => ({
          phase: previous.data ? 'refreshing' : 'loading',
          data: previous.data,
          error: null,
        }));
        const params = new URLSearchParams({ include_closed: includeClosed ? 'true' : 'false' });
        if (query.trim() !== '') params.set('q', query.trim());
        api(`/api/projects/${encodeURIComponent(projectKey)}/board?${params.toString()}`)
          .then((data) => {
            if (alive) setBoard({ phase: 'ready', data, error: null });
          })
          .catch((error) => {
            if (alive) setBoard({ phase: 'error', data: null, error: error instanceof Error ? error.message : String(error) });
          });
        return () => {
          alive = false;
        };
      }, [projectKey, query, includeClosed, tick]);

      useEffect(() => {
        const timer = window.setTimeout(() => setQuery(search), 250);
        return () => window.clearTimeout(timer);
      }, [search]);

      useEffect(() => {
        const timer = window.setInterval(() => {
          if (document.visibilityState === 'visible') setTick((value) => value + 1);
        }, 20000);
        return () => window.clearInterval(timer);
      }, []);

      useEffect(() => {
        if (selectedKey === null) {
          setDetail({ phase: 'idle', issue: null, error: null });
          return undefined;
        }
        let alive = true;
        setDetail((previous) => ({
          phase: previous.issue && previous.issue.key === selectedKey ? 'ready' : 'loading',
          issue: previous.issue && previous.issue.key === selectedKey ? previous.issue : null,
          error: null,
        }));
        api(`/api/issues/${encodeURIComponent(selectedKey)}`)
          .then((payload) => {
            if (alive) setDetail({ phase: 'ready', issue: payload ? payload.issue : null, error: null });
          })
          .catch((error) => {
            if (alive) setDetail({ phase: 'error', issue: null, error: error instanceof Error ? error.message : String(error) });
          });
        return () => {
          alive = false;
        };
      }, [selectedKey, detailTick]);

      const selectProject = useCallback((key) => {
        setProjectKey(key);
        storeProject(key);
        setSelectedKey(null);
      }, []);

      const runAction = useCallback(async (action) => {
        setBusy(true);
        setActionError(null);
        try {
          await action();
          return true;
        } catch (error) {
          setActionError(error instanceof Error ? error.message : String(error));
          return false;
        } finally {
          setBusy(false);
        }
      }, []);

      const toggleClosed = useCallback((checked) => {
        setIncludeClosed(checked);
        storeClosed(checked);
      }, []);

      const openIssue = useCallback((issue) => {
        if (suppressClickRef.current) return;
        setActionError(null);
        setSelectedKey(issue.key);
      }, []);

      const endDrag = useCallback(() => {
        dragIssueRef.current = null;
        setDragKey(null);
        setDragTarget(null);
        if (suppressTimerRef.current !== null) window.clearTimeout(suppressTimerRef.current);
        suppressTimerRef.current = window.setTimeout(() => {
          suppressClickRef.current = false;
          suppressTimerRef.current = null;
        }, 150);
      }, []);

      const beginDrag = useCallback((issue, event) => {
        if (suppressTimerRef.current !== null) {
          window.clearTimeout(suppressTimerRef.current);
          suppressTimerRef.current = null;
        }
        dragIssueRef.current = issue;
        suppressClickRef.current = true;
        setDragKey(issue.key);
        setDragTarget({ stage: issue.stage, issueId: null });
        if (event && event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          try {
            event.dataTransfer.setData('text/plain', issue.key);
          } catch {
            /* some engines require data; a failure here must not abort the drag */
          }
        }
      }, []);

      const dragOverCard = useCallback((stage, issueId) => {
        setDragTarget((previous) =>
          previous !== null && previous.stage === stage && previous.issueId === issueId
            ? previous
            : { stage, issueId },
        );
      }, []);

      const dragOverColumn = useCallback((stage) => {
        setDragTarget((previous) =>
          previous !== null && previous.stage === stage && previous.issueId === null
            ? previous
            : { stage, issueId: null },
        );
      }, []);

      const dragLeaveColumn = useCallback((stage) => {
        setDragTarget((previous) => (previous !== null && previous.stage === stage ? null : previous));
      }, []);

      useEffect(() => {
        const clearIfDragging = () => {
          if (dragIssueRef.current !== null) endDrag();
        };
        window.addEventListener('dragend', clearIfDragging);
        window.addEventListener('drop', clearIfDragging);
        return () => {
          window.removeEventListener('dragend', clearIfDragging);
          window.removeEventListener('drop', clearIfDragging);
        };
      }, [endDrag]);

      const performMove = useCallback(
        async (issue, stage, position) => {
          const snapshot = board.data;
          setActionError(null);
          if (snapshot !== null) {
            setBoard((current) =>
              current.data
                ? {
                    ...current,
                    phase: 'refreshing',
                    data: moveIssueInBoard(current.data, issue, stage, position),
                    error: null,
                  }
                : current,
            );
          }
          setMovingKeys((keys) => (keys.includes(issue.key) ? keys : [...keys, issue.key]));
          try {
            const payload = await api(`/api/issues/${encodeURIComponent(issue.key)}/move`, {
              method: 'POST',
              body: { expected_rev: issue.rev, stage, position },
            });
            const confirmed = payload && payload.issue ? payload.issue : null;
            if (confirmed) {
              setBoard((current) =>
                current.data
                  ? {
                      ...current,
                      data: patchBoardIssue(current.data, issue.id, {
                        rev: confirmed.rev,
                        stage: confirmed.stage,
                        position: confirmed.position,
                        updated_at: confirmed.updated_at,
                      }),
                    }
                  : current,
              );
            }
            setDetailTick((value) => value + 1);
            setTick((value) => value + 1);
          } catch (error) {
            if (snapshot !== null) setBoard({ phase: 'ready', data: snapshot, error: null });
            const conflict = error instanceof ApiError && error.status === 409;
            setActionError(conflict ? t('board.moveConflict') : error instanceof Error ? error.message : String(error));
            setTick((value) => value + 1);
          } finally {
            setMovingKeys((keys) => keys.filter((key) => key !== issue.key));
          }
        },
        [board.data, t],
      );

      const dropOn = useCallback(
        (stage, overIssueId) => {
          const issue = dragIssueRef.current;
          endDrag();
          if (!issue || board.data === null) return;
          if (overIssueId === issue.id) return;
          const column = board.data.columns.find((entry) => entry.stage === stage);
          if (!column) return;
          const targetIssues = column.issues.filter((entry) => entry.id !== issue.id);
          let overIndex = targetIssues.length;
          if (overIssueId !== null && overIssueId !== undefined) {
            const found = targetIssues.findIndex((entry) => entry.id === overIssueId);
            if (found >= 0) overIndex = found;
          }
          const position = computeDropPosition(targetIssues, overIndex);
          if (issue.stage === stage && Math.abs(issue.position - position) < 0.001) return;
          void performMove(issue, stage, position);
        },
        [board.data, endDrag, performMove],
      );

      const moveIssue = useCallback(
        (issue, stage) =>
          runAction(async () => {
            await api(`/api/issues/${encodeURIComponent(issue.key)}/move`, {
              method: 'POST',
              body: { expected_rev: issue.rev, stage },
            });
            setDetailTick((value) => value + 1);
            setTick((value) => value + 1);
          }),
        [runAction],
      );

      const addComment = useCallback(
        (issue, body) =>
          runAction(async () => {
            await api(`/api/issues/${encodeURIComponent(issue.key)}/comments`, {
              method: 'POST',
              body: { body },
            });
            setDetailTick((value) => value + 1);
            setTick((value) => value + 1);
          }),
        [runAction],
      );

      const createIssue = useCallback(
        async (draft) => {
          if (projectKey === null) return false;
          const ok = await runAction(async () => {
            const payload = await api('/api/issues', {
              method: 'POST',
              body: { project: projectKey, title: draft.title, description: draft.description, stage: draft.stage, priority: draft.priority },
            });
            setTick((value) => value + 1);
            if (payload && payload.issue && payload.issue.key) setSelectedKey(payload.issue.key);
          });
          if (ok) setCreating(false);
          return ok;
        },
        [projectKey, runAction],
      );

      const openCreate = useCallback(() => {
        setActionError(null);
        setCreating(true);
      }, []);

      const closeCreate = useCallback(() => {
        setCreating(false);
      }, []);

      const closeDrawer = useCallback(() => {
        setSelectedKey(null);
        setActionError(null);
      }, []);

      const currentProject = useMemo(() => {
        if (board.data && board.data.project) return board.data.project;
        return projects.items.find((project) => project.key === projectKey) || null;
      }, [board.data, projects.items, projectKey]);

      const columns = board.data && Array.isArray(board.data.columns) ? board.data.columns : [];
      const hasProjects = projects.items.length > 0;
      const detailOpen = selectedKey !== null;

      return h(
        'section',
        {
          className: 'sc-page',
          'data-plugin-panel': true,
          'aria-busy': board.phase === 'loading' || projects.phase === 'loading',
        },
        h(
          'header',
          { className: 'sc-header', 'data-window-drag': true },
          h(
            'div',
            { className: 'sc-heading' },
            h('h1', { className: 'sc-title' }, t('title')),
            h(
              'div',
              { className: 'sc-subtitle' },
              h('span', { className: `sc-dot ${connection.phase === 'ready' ? 'is-online' : connection.phase === 'offline' ? 'is-offline' : ''}` }),
              h('span', null, connection.phase === 'ready' ? t('status.online') : connection.phase === 'offline' ? t('status.offline') : t('status.connecting')),
              connection.version ? h('span', { className: 'sc-sep' }, '·') : null,
              connection.version ? h('span', null, `v${connection.version}`) : null,
              currentProject ? h('span', { className: 'sc-sep' }, '·') : null,
              currentProject ? h('span', null, currentProject.name) : null,
            ),
          ),
          h(
            'div',
            { className: 'sc-actions' },
            h('input', {
              className: 'sc-search',
              type: 'search',
              value: search,
              placeholder: t('search'),
              'aria-label': t('search'),
              onChange: (event) => setSearch(event.target.value),
            }),
            h(
              'label',
              { className: 'sc-toggle' },
              h('input', { type: 'checkbox', checked: includeClosed, onChange: (event) => toggleClosed(event.target.checked) }),
              h('span', null, t('showClosed')),
            ),
            h(
              'button',
              { type: 'button', className: 'sc-button', onClick: refresh, title: t('refresh'), 'aria-label': t('refresh') },
              h(IconRefresh),
              t('refresh'),
            ),
            h(
              'button',
              { type: 'button', className: 'sc-button is-primary', onClick: openCreate, disabled: !currentProject },
              h(IconPlus),
              t('newIssue'),
            ),
            currentProject
              ? h(
                  'a',
                  { className: 'sc-button', href: boardAppPath(currentProject.key), target: '_blank', rel: 'noreferrer' },
                  h(IconExternal),
                  t('openApp'),
                )
              : null,
          ),
        ),
        connection.phase === 'offline'
          ? h(OfflineBanner, { t, message: connection.message, onRetry: refresh })
          : null,
        projects.phase === 'error' && connection.phase !== 'offline'
          ? h(
              'div',
              { className: 'sc-banner is-error', role: 'alert' },
              h('div', { className: 'sc-bannerBody' }, h('p', { className: 'sc-bannerTitle' }, t('projects.error')), h('p', null, projects.error || '')),
              h('button', { type: 'button', className: 'sc-button', onClick: refresh }, t('retry')),
            )
          : null,
        actionError && !detailOpen && !creating
          ? h(
              'div',
              { className: 'sc-banner is-error', role: 'alert' },
              h(
                'div',
                { className: 'sc-bannerBody' },
                h('p', { className: 'sc-bannerTitle' }, t('action.failed')),
                h('p', null, actionError),
              ),
              h('button', { type: 'button', className: 'sc-button', onClick: () => setActionError(null) }, t('close')),
            )
          : null,
        h(
          'nav',
          { className: 'sc-projects', 'aria-label': t('projects') },
          projects.items.map((project) =>
            h(
              'button',
              {
                key: project.key,
                type: 'button',
                className: 'sc-project',
                'aria-pressed': project.key === projectKey,
                onClick: () => selectProject(project.key),
              },
              project.name,
              h('span', { className: 'sc-projectCount' }, String(project.counts ? project.counts.total : 0)),
            ),
          ),
        ),
        !hasProjects && projects.phase === 'ready'
          ? h(
              'div',
              { className: 'sc-emptyState' },
              h('h2', { className: 'sc-emptyTitle' }, t('noProjects.title')),
              h('p', { className: 'sc-emptyBody' }, t('noProjects.body')),
              h('a', { className: 'sc-button is-primary', href: appPath('/'), target: '_blank', rel: 'noreferrer' }, h(IconExternal), t('openApp')),
            )
          : h(
              'div',
              { className: 'sc-board' },
              board.phase === 'idle' || (board.phase === 'loading' && !board.data)
                ? h('div', { className: 'sc-loading' }, t('loading'))
                : board.phase === 'error'
                  ? h(
                      'div',
                      { className: 'sc-emptyState' },
                      h('p', { className: 'sc-errorText' }, `${t('board.error')} ${board.error || ''}`),
                      h('button', { type: 'button', className: 'sc-button', onClick: refresh }, t('retry')),
                    )
                  : columns.map((column) =>
                      h(BoardColumnView, {
                        key: column.stage,
                        column,
                        t,
                        onOpen: openIssue,
                        dragTarget,
                        draggingKey: dragKey,
                        movingKeys,
                        onCardDragStart: beginDrag,
                        onCardDragEnd: endDrag,
                        onCardDragOver: dragOverCard,
                        onCardDrop: dropOn,
                        onColumnDragOver: dragOverColumn,
                        onColumnDrop: dropOn,
                        onColumnDragLeave: dragLeaveColumn,
                      }),
                    ),
            ),
        detailOpen
          ? h(DetailDrawer, {
              key: selectedKey,
              t,
              state: detail,
              onClose: closeDrawer,
              onMove: moveIssue,
              onComment: addComment,
              busy,
              error: actionError,
            })
          : null,
        creating
          ? h(CreateIssueDialog, {
              t,
              projectName: currentProject ? currentProject.name : '',
              busy,
              error: actionError,
              onClose: closeCreate,
              onSubmit: createIssue,
            })
          : null,
      );
    }

    /* ── client plugin ────────────────────────────────────────────────────── */

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'shared-context: dictionaries');

      ctx.effect(() => {
        const tag = document.createElement('style');
        tag.dataset.plugin = 'dsh-plugin-shared-context';
        tag.textContent = STYLE;
        document.head.appendChild(tag);
        return () => {
          tag.remove();
        };
      }, 'shared-context: surface styles');

      const t = ctx.locale.bind(NS);

      ctx.slots.inject('main', () =>
        ctx.slots.register(
          {
            name: 'main',
            key: PANEL_ID,
            locale: NS,
          },
          Page,
        ),
      );

      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 1,
            label: () => t('panel'),
            locale: NS,
          },
          PanelIcon,
        ),
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply,
    };
  },
});
