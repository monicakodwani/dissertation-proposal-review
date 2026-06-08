const dashboardConfig = window.DISSERTATION_DASHBOARD_CONFIG || { mode: 'server' };
const isStaticReview = dashboardConfig.mode === 'static-review';
const reviewerStorageKey = dashboardConfig.storageKey || 'dissertation-review-feedback';

const state = {
  content: null,
  comments: [],
  activeChapterId: null,
  activeBlockId: null,
  query: '',
  selectedQuote: '',
  dirtyBlocks: {},
  insertBlocks: {},
  savedSuggestions: [],
  theme: localStorage.getItem('reader-theme') || 'light',
  collapsed: {
    sidebar: false,
    sections: false,
    inspector: false,
  },
};

const app = document.querySelector('#app');
let selectionListenerBound = false;

function readReviewerFeedback() {
  try {
    return JSON.parse(localStorage.getItem(reviewerStorageKey) || '{}');
  } catch {
    return {};
  }
}

function writeReviewerFeedback(feedback) {
  localStorage.setItem(reviewerStorageKey, JSON.stringify(feedback));
}

function saveLocalComments(comments) {
  const feedback = readReviewerFeedback();
  feedback.comments = comments;
  writeReviewerFeedback(feedback);
}

function saveLocalSuggestions(suggestions) {
  const feedback = readReviewerFeedback();
  feedback.suggestions = suggestions;
  writeReviewerFeedback(feedback);
}

async function api(path, options = {}) {
  if (isStaticReview) {
    if (path === '/api/content') {
      const response = await fetch('data/content.json');
      if (!response.ok) throw new Error('Could not load static dissertation content.');
      return response.json();
    }
    if (path === '/api/comments') {
      const feedback = readReviewerFeedback();
      return feedback.comments || [];
    }
  }

  const response = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

async function load() {
  const results = await Promise.all([api('/api/content'), api('/api/comments')]);
  state.content = results[0];
  state.comments = results[1];
  state.savedSuggestions = readReviewerFeedback().suggestions || [];
  if (!state.activeChapterId && state.content.chapters[0]) {
    state.activeChapterId = state.content.chapters[0].id;
  }
  render();
}

function escapeHtml(value = '') {
  return String(value)
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;')
    .split("'").join('&#039;');
}

function normalizeText(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

function chapterMatches(chapter) {
  const query = state.query.trim().toLowerCase();
  if (!query) return true;
  const parts = [chapter.title];
  chapter.blocks.forEach((block) => {
    parts.push(block.title, block.text, block.raw, block.caption, block.author, block.year, block.venue, block.key);
  });
  return parts.filter(Boolean).join(' ').toLowerCase().includes(query);
}

function getVisibleChapters() {
  return state.content.chapters.filter(chapterMatches);
}

function getActiveChapter() {
  const visible = getVisibleChapters();
  return visible.find((chapter) => chapter.id === state.activeChapterId) || visible[0] || state.content.chapters[0];
}

function getActiveBlock() {
  return state.content.blocksById[state.activeBlockId] || null;
}

function blockComments(blockId) {
  return state.comments.filter((comment) => comment.blockId === blockId);
}

function setTheme(theme) {
  state.theme = theme;
  localStorage.setItem('reader-theme', theme);
  render();
}

function themeIcon(theme) {
  if (theme === 'dark') return '◐';
  if (theme === 'rose') return '✦';
  return '☼';
}

function themeLabel(theme) {
  if (theme === 'dark') return 'Dark mode';
  if (theme === 'rose') return 'Rose mode';
  return 'Light mode';
}

function toggleCollapse(panel) {
  state.collapsed[panel] = !state.collapsed[panel];
  render();
}

function render() {
  const chapter = getActiveChapter();
  const visibleChapters = getVisibleChapters();
  const paragraphBlocks = chapter.blocks.filter((block) => block.type === 'paragraph');
  const sectionBlocks = chapter.blocks.filter((block) => block.type === 'heading' && block.level !== 'chapter');
  const chapterWords = paragraphBlocks.reduce((sum, block) => sum + block.text.split(/\s+/).filter(Boolean).length, 0);

  document.body.className = `theme-${state.theme}`;
  app.innerHTML = `
    <main class="shell ${state.collapsed.sidebar ? 'sidebar-collapsed' : ''} ${state.collapsed.sections ? 'sections-collapsed' : ''} ${state.collapsed.inspector ? 'inspector-collapsed' : ''}">
      <aside class="sidebar">
        <div class="brand">
          <div class="mark">D</div>
          <div>
            <p class="eyebrow">Dissertation Workbench</p>
            <h1>${escapeHtml(state.content.title)}</h1>
          </div>
        </div>
        <label class="search">
          <span>⌕</span>
          <input id="search" type="search" value="${escapeHtml(state.query)}" placeholder="Search text" />
        </label>
        <nav class="tabs">
          ${visibleChapters.map((item, index) => `
            <button class="tab ${item.id === chapter.id ? 'active' : ''}" data-chapter="${item.id}">
              <span>${String(index + 1).padStart(2, '0')}</span>
              <strong>${escapeHtml(item.title)}</strong>
            </button>
          `).join('')}
        </nav>
      </aside>

      <section class="reader">
        <header class="topbar">
          <div>
            <p class="eyebrow">Live LaTeX Reader</p>
            <h2>${escapeHtml(chapter.title)}</h2>
          </div>
          <div class="toolbar">
            <div class="segmented icon-segmented" aria-label="Theme">
              ${['light', 'dark', 'rose'].map((theme) => `<button class="${state.theme === theme ? 'active' : ''}" data-theme="${theme}" title="${themeLabel(theme)}" aria-label="${themeLabel(theme)}">${themeIcon(theme)}</button>`).join('')}
            </div>
            <div class="action-group">
              <button class="tool-button" id="export-review">${isStaticReview ? 'Export Feedback' : 'Export'}</button>
              ${isStaticReview ? '' : '<button class="tool-button secondary" id="export-static">Share Site</button>'}
            </div>
          </div>
        </header>

        ${isStaticReview ? renderReviewNotice() : ''}

        <div class="stats">
          <div class="stat"><strong>${state.content.stats.chapters}</strong><span>chapters</span></div>
          <div class="stat"><strong>${state.content.stats.blocks}</strong><span>blocks</span></div>
          <div class="stat"><strong>${chapterWords.toLocaleString()}</strong><span>words here</span></div>
        </div>

        <div class="content-layout">
          <nav class="sections">
            <div class="panel-head"><p class="eyebrow">In This Tab</p></div>
            ${sectionBlocks.map((block) => `<button class="section-link" data-scroll="${block.id}">${escapeHtml(block.title)}</button>`).join('') || '<p class="quiet">No section headings</p>'}
          </nav>
          <button class="panel-toggle section-toggle" data-collapse="sections" title="${state.collapsed.sections ? 'Show section list' : 'Hide section list'}" aria-label="${state.collapsed.sections ? 'Show section list' : 'Hide section list'}">${state.collapsed.sections ? '›' : '‹'}</button>
          <article class="paper">
            ${chapter.blocks.map((block, index) => renderBlock(block, chapter.blocks[index + 1])).join('')}
          </article>
        </div>
      </section>

      <aside class="inspector" id="inspector">
        ${renderInspector(getActiveBlock())}
      </aside>
      <button class="panel-toggle sidebar-edge" data-collapse="sidebar" title="${state.collapsed.sidebar ? 'Show outline' : 'Hide outline'}" aria-label="${state.collapsed.sidebar ? 'Show outline' : 'Hide outline'}">${state.collapsed.sidebar ? '›' : '‹'}</button>
      <button class="panel-toggle inspector-edge" data-collapse="inspector" title="${state.collapsed.inspector ? 'Show comments' : 'Hide comments'}" aria-label="${state.collapsed.inspector ? 'Show comments' : 'Hide comments'}">${state.collapsed.inspector ? '‹' : '›'}</button>
    </main>
    <button class="selection-popover" id="selection-popover" type="button">Comment</button>
    <div class="save-dock" id="save-dock"><span id="dirty-count">0 unsaved edits</span><button class="tool-button" id="save-inline-edits">Save text changes</button></div>
    <div class="toast" id="toast"><span></span></div>
  `;
  bindEvents();
}

function renderReviewNotice() {
  return `
    <section class="review-notice">
      <strong>Shared review mode</strong>
      <span>Comments and text suggestions are saved in this browser. Export feedback when you are done.</span>
    </section>
  `;
}

function renderBlock(block, nextBlock) {
  if (block.type === 'heading') {
    const emptyHeading = block.level !== 'chapter' && (!nextBlock || nextBlock.type === 'heading');
    return `
      <section class="block heading heading-${block.level}" id="${block.id}">
        <span class="label">${escapeHtml(cleanHeadingLabel(block.level))}</span>
        <h2>${escapeHtml(block.title)}</h2>
        ${emptyHeading ? renderEmptyHeadingEditor(block) : ''}
      </section>
    `;
  }

  if (block.type === 'figure' || block.type === 'table') {
    return `
      <figure class="block float-card ${block.type}" id="${block.id}">
        <div class="float-head">
          <span class="label">${block.type}</span>
          ${block.label ? `<code>${escapeHtml(block.label)}</code>` : ''}
        </div>
        ${renderFloatMedia(block)}
        ${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : `<figcaption>${escapeHtml(block.title)}</figcaption>`}
        <details><summary>Source LaTeX</summary><pre>${escapeHtml(block.raw)}</pre></details>
      </figure>
    `;
  }

  if (block.type === 'reference') {
    return `
      <article class="block reference-card" id="${block.id}">
        <p class="reference-key">${escapeHtml(block.key)} · ${escapeHtml(block.entryType)}</p>
        <h3>${escapeHtml(block.title)}</h3>
        <p>${escapeHtml([block.author, block.year, block.venue].filter(Boolean).join(' · '))}</p>
        ${block.url ? `<a href="${escapeHtml(block.url)}" target="_blank" rel="noreferrer">${escapeHtml(block.url)}</a>` : ''}
      </article>
    `;
  }

  const hasComment = blockComments(block.id).length > 0;
  const isDirty = Object.prototype.hasOwnProperty.call(state.dirtyBlocks, block.id);
  return `
    <p class="block paragraph ${block.id === state.activeBlockId ? 'active' : ''} ${hasComment ? 'has-comment' : ''} ${isDirty ? 'dirty' : ''}"
       id="${block.id}" data-block="${block.id}" data-original="${escapeHtml(normalizeText(block.text))}" contenteditable="true" spellcheck="true">${renderParagraphText(block)}</p>
  `;
}

function cleanHeadingLabel(level) {
  if (level === 'chapter') return 'Chapter';
  if (level === 'section') return 'Section';
  if (level === 'subsection') return 'Subsection';
  if (level === 'subsubsection') return 'Detail';
  return 'Note';
}

function renderEmptyHeadingEditor(block) {
  const value = state.insertBlocks[block.id] || '';
  return `
    <div class="empty-editor" data-empty-shell="${block.id}">
      <div class="empty-copy">No text under this heading yet.</div>
      <div class="empty-input" contenteditable="true" spellcheck="true" data-insert-after="${block.id}">${escapeHtml(value)}</div>
    </div>
  `;
}

function renderParagraphText(block) {
  const comments = blockComments(block.id).filter((comment) => comment.quote);
  if (!comments.length) return escapeHtml(block.text);
  const ranges = [];
  comments.forEach((comment) => {
    const index = block.text.indexOf(comment.quote);
    if (index >= 0) ranges.push({ start: index, end: index + comment.quote.length, comment });
  });
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept = [];
  ranges.forEach((range) => {
    if (!kept.some((existing) => range.start < existing.end && range.end > existing.start)) kept.push(range);
  });
  let cursor = 0;
  let html = '';
  kept.forEach((range) => {
    html += escapeHtml(block.text.slice(cursor, range.start));
    html += `<mark class="comment-highlight" title="${escapeHtml(range.comment.note)}">${escapeHtml(block.text.slice(range.start, range.end))}</mark>`;
    cursor = range.end;
  });
  html += escapeHtml(block.text.slice(cursor));
  return html;
}

function renderFloatMedia(block) {
  if (block.type === 'table' && (!block.graphics || !block.graphics.length)) return renderTablePreview(block.raw);
  if (!block.graphics || !block.graphics.length) return '<div class="missing-media">No linked image file found in this figure.</div>';
  return block.graphics.map((graphic) => {
    if (!graphic.url) return `<div class="missing-media">Missing asset: ${escapeHtml(graphic.source)}</div>`;
    if (['png', 'jpg', 'jpeg', 'svg'].includes(graphic.kind)) return `<img class="figure-preview" src="${graphic.url}" alt="${escapeHtml(block.caption || block.title)}" />`;
    if (graphic.kind === 'pdf') return `<object class="pdf-preview" data="${graphic.url}" type="application/pdf"><a href="${graphic.url}" target="_blank" rel="noreferrer">Open PDF figure: ${escapeHtml(graphic.file)}</a></object>`;
    return `<a href="${graphic.url}" target="_blank" rel="noreferrer">Open asset: ${escapeHtml(graphic.file)}</a>`;
  }).join('');
}

function renderTablePreview(raw) {
  const withoutCaption = raw
    .replace(/\\caption(?:\[[^\]]*\])?\{(?:[^{}]|\{[^{}]*\})*\}/g, '')
    .replace(/\\label\{[^}]+\}/g, '')
    .replace(/\\begin\{[^}]+\}/g, '')
    .replace(/\\end\{[^}]+\}/g, '')
    .replace(/\\toprule|\\midrule|\\bottomrule|\\hline/g, '\n')
    .replace(/\\textbf\{([^{}]*)\}/g, '$1')
    .replace(/\\multicolumn\{[^}]+\}\{[^}]+\}\{([^{}]*)\}/g, '$1')
    .replace(/\\cite[a-zA-Z*]*\{([^}]+)\}/g, '[$1]');
  const rows = withoutCaption.split(/\\\\/).map((row) => row.replace(/%.*$/gm, '').trim()).filter((row) => row && !row.startsWith('\\centering') && !row.startsWith('\\small')).slice(0, 24).map((row) => row.split('&').map((cell) => escapeHtml(cell.replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?(?:\{[^{}]*\})?/g, '').replace(/[{}]/g, '').trim())));
  if (!rows.length) return '<div class="missing-media">Table source is available below.</div>';
  return `<div class="table-preview" role="region" aria-label="Table preview"><table><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function renderInspector(block) {
  if (!block || block.type !== 'paragraph') {
    return `
      <div class="panel-head"><div><p class="eyebrow">Comments</p><h2>Highlight text to comment</h2></div><button class="mini-button" data-collapse="inspector">Collapse</button></div>
      <div class="meta-card"><p>Select words inside the dissertation text, then write a comment here. To revise, click directly into the paragraph and type.</p></div>
    `;
  }
  const selectedQuote = state.selectedQuote || '';
  return `
    <div class="panel-head"><div><p class="eyebrow">Comments</p><h2>${selectedQuote ? 'Selected passage' : 'Select text'}</h2></div><button class="mini-button" data-collapse="inspector">Collapse</button></div>
    <div class="meta-card">
      <p>${escapeHtml(block.file)} · lines ${block.startLine}-${block.endLine}</p>
      ${selectedQuote ? `<blockquote>${escapeHtml(selectedQuote)}</blockquote>` : '<p>Drag across specific words in the main text to attach a comment to that exact passage.</p>'}
    </div>
    <div class="editor-card">
      <p class="eyebrow">New Comment</p>
      <textarea id="comment-note" placeholder="Write a comment for the highlighted text"></textarea>
      <div class="button-row"><button class="tool-button" id="save-comment">Add Comment</button></div>
    </div>
    <div class="comments-list">
      <p class="eyebrow">Comments on this paragraph</p>
      ${blockComments(block.id).map((comment) => `
        <div class="comment">
          ${comment.quote ? `<p><strong>${escapeHtml(comment.quote)}</strong></p>` : ''}
          <p>${escapeHtml(comment.note)}</p>
          <small>${escapeHtml(new Date(comment.updatedAt || comment.timestamp).toLocaleString())}</small>
          <div class="comment-actions">
            <button class="mini-button" data-edit-comment="${escapeHtml(comment.id)}">Edit</button>
            <button class="mini-button danger" data-delete-comment="${escapeHtml(comment.id)}">Delete</button>
          </div>
        </div>
      `).join('') || '<p class="quiet">No comments yet</p>'}
    </div>
  `;
}

function updateInspector() {
  const inspector = document.querySelector('#inspector');
  if (!inspector) return;
  inspector.innerHTML = renderInspector(getActiveBlock());
  bindPanelButtons();
  const saveCommentButton = document.querySelector('#save-comment');
  if (saveCommentButton) saveCommentButton.addEventListener('click', saveComment);
  bindCommentActions();
}

function hideSelectionPopover() {
  const popover = document.querySelector('#selection-popover');
  if (!popover) return;
  popover.classList.remove('show');
}

function showSelectionPopover(range) {
  const popover = document.querySelector('#selection-popover');
  const paper = document.querySelector('.paper');
  if (!popover || !paper) return;
  const rect = range.getBoundingClientRect();
  const paperRect = paper.getBoundingClientRect();
  const left = Math.min(Math.max(rect.left + rect.width / 2, paperRect.left + 62), paperRect.right - 62);
  const top = Math.max(rect.top - 44, paperRect.top + 12);
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
  popover.classList.add('show');
}

function openCommentPanelForSelection() {
  if (!state.selectedQuote || !state.activeBlockId) return;
  state.collapsed.inspector = false;
  render();
  const noteBox = document.querySelector('#comment-note');
  if (noteBox) noteBox.focus();
}

function updateDirtyDock() {
  const dock = document.querySelector('#save-dock');
  const countLabel = document.querySelector('#dirty-count');
  const count = Object.keys(state.dirtyBlocks).length + Object.keys(state.insertBlocks).filter((key) => state.insertBlocks[key].trim()).length;
  if (!dock || !countLabel) return;
  countLabel.textContent = count === 1 ? '1 unsaved edit' : `${count} unsaved edits`;
  dock.classList.toggle('show', count > 0);
}

function captureSelection() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    hideSelectionPopover();
    return;
  }
  const quote = selection.toString().replace(/\s+/g, ' ').trim();
  if (!quote) {
    hideSelectionPopover();
    return;
  }
  let node = selection.anchorNode;
  if (node && node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  const paragraph = node && node.closest ? node.closest('[data-block]') : null;
  if (!paragraph) {
    hideSelectionPopover();
    return;
  }
  state.activeBlockId = paragraph.dataset.block;
  state.selectedQuote = quote;
  document.querySelectorAll('.paragraph').forEach((item) => item.classList.remove('active'));
  paragraph.classList.add('active');
  updateInspector();
  if (selection.rangeCount) showSelectionPopover(selection.getRangeAt(0));
}

function bindPanelButtons() {
  document.querySelectorAll('[data-collapse]').forEach((button) => {
    button.addEventListener('click', () => toggleCollapse(button.dataset.collapse));
  });
}

function bindEvents() {
  const searchInput = document.querySelector('#search');
  if (searchInput) searchInput.addEventListener('input', (event) => {
    state.query = event.target.value;
    state.activeChapterId = null;
    state.activeBlockId = null;
    render();
  });
  document.querySelectorAll('[data-theme]').forEach((button) => button.addEventListener('click', () => setTheme(button.dataset.theme)));
  bindPanelButtons();
  document.querySelectorAll('[data-chapter]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeChapterId = button.dataset.chapter;
      state.activeBlockId = null;
      state.selectedQuote = '';
      render();
    });
  });
  document.querySelectorAll('[data-scroll]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = document.getElementById(button.dataset.scroll);
      const paper = document.querySelector('.paper');
      if (!target || !paper) return;
      paper.scrollTo({ top: Math.max(0, target.offsetTop - paper.offsetTop - 16), behavior: 'smooth' });
      document.querySelectorAll('.section-link').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
    });
  });
  document.querySelectorAll('[data-block]').forEach((block) => {
    const activateBlock = () => {
      state.activeBlockId = block.dataset.block;
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        state.selectedQuote = '';
        hideSelectionPopover();
      }
      document.querySelectorAll('.paragraph').forEach((item) => item.classList.remove('active'));
      block.classList.add('active');
      updateInspector();
    };
    block.addEventListener('focus', activateBlock);
    block.addEventListener('click', activateBlock);
    block.addEventListener('mouseup', () => window.setTimeout(captureSelection, 0));
    block.addEventListener('keyup', captureSelection);
    block.addEventListener('input', () => {
      const blockId = block.dataset.block;
      const edited = normalizeText(block.innerText);
      const original = normalizeText(block.dataset.original || '');
      if (edited === original) {
        delete state.dirtyBlocks[blockId];
        block.classList.remove('dirty');
      } else {
        state.dirtyBlocks[blockId] = edited;
        block.classList.add('dirty');
      }
      updateDirtyDock();
    });
  });
  document.querySelectorAll('[data-insert-after]').forEach((block) => {
    block.addEventListener('input', () => {
      const text = normalizeText(block.innerText);
      if (text) {
        state.insertBlocks[block.dataset.insertAfter] = text;
        block.closest('.empty-editor').classList.add('dirty');
      } else {
        delete state.insertBlocks[block.dataset.insertAfter];
        block.closest('.empty-editor').classList.remove('dirty');
      }
      updateDirtyDock();
    });
  });
  const saveCommentButton = document.querySelector('#save-comment');
  if (saveCommentButton) saveCommentButton.addEventListener('click', saveComment);
  bindCommentActions();
  const saveInlineButton = document.querySelector('#save-inline-edits');
  if (saveInlineButton) saveInlineButton.addEventListener('click', saveInlineEdits);
  const exportReviewButton = document.querySelector('#export-review');
  if (exportReviewButton) exportReviewButton.addEventListener('click', exportReview);
  const exportStaticButton = document.querySelector('#export-static');
  if (exportStaticButton) exportStaticButton.addEventListener('click', exportStaticSite);
  const selectionPopover = document.querySelector('#selection-popover');
  if (selectionPopover) selectionPopover.addEventListener('click', openCommentPanelForSelection);
  if (!selectionListenerBound) {
    document.addEventListener('selectionchange', () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) hideSelectionPopover();
    });
    selectionListenerBound = true;
  }
  updateDirtyDock();
}

function bindCommentActions() {
  document.querySelectorAll('[data-edit-comment]').forEach((button) => {
    button.addEventListener('click', editComment);
  });
  document.querySelectorAll('[data-delete-comment]').forEach((button) => {
    button.addEventListener('click', deleteComment);
  });
}

async function editComment(event) {
  const commentId = event.currentTarget.dataset.editComment;
  const comment = state.comments.find((item) => item.id === commentId);
  if (!comment) return;
  const nextNote = window.prompt('Edit comment', comment.note || '');
  if (nextNote === null) return;
  const note = nextNote.trim();
  if (!note) return showToast('Comment cannot be empty.');
  if (isStaticReview) {
    comment.note = note;
    comment.updatedAt = new Date().toISOString();
    saveLocalComments(state.comments);
    state.activeBlockId = comment.blockId;
    state.selectedQuote = '';
    render();
    showToast('Comment updated.');
    return;
  }

  await api(`/api/comments/${encodeURIComponent(commentId)}`, { method: 'PATCH', body: JSON.stringify({ note }) });
  state.activeBlockId = comment.blockId;
  state.selectedQuote = '';
  hideSelectionPopover();
  await load();
  state.activeBlockId = comment.blockId;
  updateInspector();
  showToast('Comment updated.');
}

async function deleteComment(event) {
  const commentId = event.currentTarget.dataset.deleteComment;
  const comment = state.comments.find((item) => item.id === commentId);
  if (!comment) return;
  if (!window.confirm('Delete this comment?')) return;
  if (isStaticReview) {
    state.comments = state.comments.filter((item) => item.id !== commentId);
    saveLocalComments(state.comments);
    state.activeBlockId = comment.blockId;
    state.selectedQuote = '';
    render();
    showToast('Comment deleted.');
    return;
  }

  await api(`/api/comments/${encodeURIComponent(commentId)}`, { method: 'DELETE' });
  state.activeBlockId = comment.blockId;
  state.selectedQuote = '';
  await load();
  state.activeBlockId = comment.blockId;
  updateInspector();
  showToast('Comment deleted.');
}

async function saveComment() {
  const block = getActiveBlock();
  const noteBox = document.querySelector('#comment-note');
  const note = noteBox ? noteBox.value.trim() : '';
  const quote = state.selectedQuote;
  if (!block || !quote) return showToast('Highlight text first.');
  if (!note) return showToast('Write a comment first.');
  if (isStaticReview) {
    const comment = {
      id: `comment-${Date.now()}`,
      blockId: block.id,
      file: block.file,
      quote,
      note,
      status: 'open',
      timestamp: new Date().toISOString(),
    };
    state.comments.push(comment);
    saveLocalComments(state.comments);
    state.selectedQuote = '';
    state.activeBlockId = block.id;
    render();
    showToast('Comment saved in this browser.');
    return;
  }

  await api('/api/comments', { method: 'POST', body: JSON.stringify({ blockId: block.id, file: block.file, note, quote }) });
  state.selectedQuote = '';
  await load();
  state.activeBlockId = block.id;
  showToast('Comment saved.');
}

async function saveInlineEdits() {
  const edits = Object.entries(state.dirtyBlocks);
  const inserts = Object.entries(state.insertBlocks).filter((entry) => entry[1].trim());
  if (!edits.length && !inserts.length) return showToast('No text changes to save.');

  if (isStaticReview) {
    const suggestions = [...state.savedSuggestions];
    edits.forEach(([blockId, raw]) => {
      const block = state.content.blocksById[blockId] || {};
      suggestions.push({
        id: `suggestion-${Date.now()}-${suggestions.length + 1}`,
        type: raw.trim() ? 'replace' : 'remove',
        blockId,
        file: block.file || '',
        startLine: block.startLine || null,
        endLine: block.endLine || null,
        beforePreview: block.text || '',
        afterPreview: raw,
        timestamp: new Date().toISOString(),
      });
    });
    inserts.forEach(([blockId, raw]) => {
      const block = state.content.blocksById[blockId] || {};
      suggestions.push({
        id: `suggestion-${Date.now()}-${suggestions.length + 1}`,
        type: 'insert-after',
        blockId,
        file: block.file || '',
        line: block.endLine || null,
        afterPreview: raw,
        timestamp: new Date().toISOString(),
      });
    });
    state.savedSuggestions = suggestions;
    saveLocalSuggestions(suggestions);
    state.dirtyBlocks = {};
    state.insertBlocks = {};
    updateDirtyDock();
    showToast('Saved as feedback suggestions. Export when finished.');
    return;
  }

  for (const [blockId, raw] of edits) {
    await api(`/api/blocks/${encodeURIComponent(blockId)}`, { method: 'POST', body: JSON.stringify({ raw }) });
  }
  for (const [blockId, raw] of inserts) {
    await api(`/api/blocks/${encodeURIComponent(blockId)}/insert-after`, { method: 'POST', body: JSON.stringify({ raw }) });
  }
  state.dirtyBlocks = {};
  state.insertBlocks = {};
  await load();
  showToast('Text changes saved to LaTeX.');
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildStaticFeedbackBundle() {
  const comments = state.comments;
  const suggestions = state.savedSuggestions;
  const generatedAt = new Date().toISOString();
  const markdown = [
    '# Dissertation Review Feedback',
    '',
    `Generated: ${generatedAt}`,
    '',
    '## Comments',
    comments.length ? comments.map((comment) => [
      `### ${comment.id}`,
      `- Block: ${comment.blockId}`,
      `- File: ${comment.file || 'unknown'}`,
      comment.quote ? `- Quote: ${comment.quote}` : null,
      '',
      comment.note,
    ].filter(Boolean).join('\n')).join('\n\n') : 'No comments yet.',
    '',
    '## Suggested Text Edits',
    suggestions.length ? suggestions.map((suggestion) => [
      `### ${suggestion.id}`,
      `- Type: ${suggestion.type}`,
      `- Block: ${suggestion.blockId}`,
      `- File: ${suggestion.file || 'unknown'}`,
      suggestion.startLine ? `- Lines: ${suggestion.startLine}-${suggestion.endLine}` : null,
      suggestion.line ? `- Line: ${suggestion.line}` : null,
      '',
      suggestion.beforePreview ? `Before: ${suggestion.beforePreview}` : null,
      suggestion.afterPreview ? `After: ${suggestion.afterPreview}` : null,
    ].filter(Boolean).join('\n')).join('\n\n') : 'No suggested edits yet.',
    '',
  ].join('\n');
  return {
    generatedAt,
    siteGeneratedAt: state.content.generatedAt,
    title: state.content.title,
    comments,
    suggestions,
    markdown,
  };
}

async function exportStaticSite() {
  const result = await api('/api/export-static', { method: 'POST', body: '{}' });
  showToast(`Share site built at ${result.exportPath}`);
}

async function exportReview() {
  if (isStaticReview) {
    const bundle = buildStaticFeedbackBundle();
    downloadText(`dissertation-feedback-${Date.now()}.json`, JSON.stringify(bundle, null, 2));
    showToast('Feedback file downloaded.');
    return;
  }
  const result = await api('/api/export', { method: 'POST', body: '{}' });
  showToast(`Exported to ${result.exportPath}`);
}

function showToast(message) {
  const toast = document.querySelector('#toast');
  if (!toast) return;
  toast.querySelector('span').textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 2800);
}

load().catch((error) => {
  app.innerHTML = `<pre>${escapeHtml(error.stack || error.message)}</pre>`;
});
