(() => {
  const $ = (id) => document.getElementById(id);
  const filesEl = $('files');
  const dropEl = $('drop');
  const listEl = $('list');
  const nameEl = $('name');
  const presetEl = $('preset');
  const mergeEl = $('merge');
  const statusEl = $('status');

  /** @type {File[]} */
  let files = [];

  function renderList(){
    listEl.innerHTML = '';
    files.forEach((f, i) => {
      const li = document.createElement('li');
      li.style.display = 'flex';
      li.style.alignItems = 'center';
      li.style.gap = '8px';

      const label = document.createElement('span');
      label.style.flex = '1';
      label.textContent = `${i+1}. ${f.name} (${Math.round(f.size/1024)} KB)`;

      const up = document.createElement('button');
      up.textContent = '▲';
      up.title = '上へ';
      up.style.padding = '2px 8px';
      up.disabled = i === 0;
      up.onclick = () => { swap(i, i-1); };

      const down = document.createElement('button');
      down.textContent = '▼';
      down.title = '下へ';
      down.style.padding = '2px 8px';
      down.disabled = i === files.length - 1;
      down.onclick = () => { swap(i, i+1); };

      const del = document.createElement('button');
      del.textContent = '×';
      del.title = '削除';
      del.style.padding = '2px 8px';
      del.onclick = () => { files.splice(i,1); renderList(); };

      li.append(label, up, down, del);
      listEl.appendChild(li);
    });
    mergeEl.disabled = files.length === 0;
  }

  function swap(i, j){
    if (j < 0 || j >= files.length) return;
    const t = files[i];
    files[i] = files[j];
    files[j] = t;
    renderList();
  }

  function addPDFFiles(list){
    let skipped = 0;
    for (const f of list){
      if (!f) continue;
      const isPdf = (f.type === 'application/pdf') || f.name.toLowerCase().endsWith('.pdf');
      if (isPdf) files.push(f); else skipped++;
    }
    renderList();
    if (skipped > 0) {
      statusEl.textContent = `PDF以外 ${skipped} 件は無視しました`;
      statusEl.className = 'status warn';
    } else {
      statusEl.className = 'status';
    }
  }

  filesEl.addEventListener('change', () => {
    addPDFFiles(Array.from(filesEl.files || []));
    filesEl.value = '';
  });

  // D&D（エリア）
  ['dragenter','dragover'].forEach(ev => dropEl.addEventListener(ev, (e) => {
    e.preventDefault(); e.stopPropagation(); dropEl.classList.add('dragover');
  }));
  ['dragleave','drop'].forEach(ev => dropEl.addEventListener(ev, (e) => {
    e.preventDefault(); e.stopPropagation(); dropEl.classList.remove('dragover');
  }));
  dropEl.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const list = dt?.files ? Array.from(dt.files) : [];
    addPDFFiles(list);
  });

  // D&D（画面全体のデフォルト動作を抑止）
  ['dragenter','dragover','drop'].forEach(ev => document.addEventListener(ev, (e) => {
    e.preventDefault();
  }));

  // プリセット → name へ反映
  presetEl.addEventListener('change', () => {
    if (!presetEl.value) return;
    nameEl.value = presetEl.value;
    nameEl.focus();
    const len = nameEl.value.length;
    nameEl.setSelectionRange(len, len);
  });

  function safeName(v){
    v = (v || '結合済み').replace(/[\\/:*?"<>|]/g, '_').trim();
    return v.toLowerCase().endsWith('.pdf') ? v : v + '.pdf';
  }

  mergeEl.addEventListener('click', async () => {
    if (files.length === 0) return;
    try {
      mergeEl.disabled = true;
      statusEl.textContent = '結合中…';
      statusEl.className = 'status';

      const { PDFDocument } = window.PDFLib;
      if (!PDFDocument) throw new Error('pdf-libが読み込まれていません');

      const merged = await PDFDocument.create();
      const failed = [];

      for (const f of files) {
        try {
          const ab = await f.arrayBuffer();
          const src = await PDFDocument.load(ab); // 暗号化/破損で例外になり得る
          const pages = await merged.copyPages(src, src.getPageIndices());
          pages.forEach(p => merged.addPage(p));
        } catch (e) {
          failed.push(f.name);
        }
      }

      if (merged.getPageCount() === 0) {
        statusEl.textContent = '失敗しました';
        statusEl.className = 'status error';
        alert('すべてのPDFの読み込みに失敗しました（暗号化/破損/サイズ過大など）');
        return;
      }

      const bytes = await merged.save({ updateFieldAppearances:false });
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = safeName(nameEl.value);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      if (failed.length > 0) {
        statusEl.textContent = `完了（一部スキップ: ${failed.length} 件）`;
        statusEl.className = 'status warn';
        alert('読み込みに失敗したファイル:\n' + failed.join('\n'));
      } else {
        statusEl.textContent = '完了';
        statusEl.className = 'status ok';
      }
    } catch (e) {
      console.error(e);
      statusEl.textContent = '失敗しました';
      statusEl.className = 'status error';
      alert('結合に失敗しました（暗号化/破損/サイズ過大など）');
    } finally {
      mergeEl.disabled = files.length === 0;
    }
  });
})();