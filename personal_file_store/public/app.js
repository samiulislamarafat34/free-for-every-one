document.addEventListener('DOMContentLoaded', () => {

  // ---- Theme Toggle ----
  let currentTheme = localStorage.getItem('theme') || 'dark';
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', currentTheme);
    document.getElementById('themeToggle').innerHTML = currentTheme === 'dark' 
      ? `<i class="fa-solid fa-sun"></i>` 
      : `<i class="fa-solid fa-moon"></i>`;
  }
  document.getElementById('themeToggle').addEventListener('click', () => {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', currentTheme);
    applyTheme();
  });
  applyTheme();

  // ---- Section Navigation ----
  const navBtns = document.querySelectorAll('.nav-btn');
  const sections = document.querySelectorAll('.section');
  
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      navBtns.forEach(b => b.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      const targetId = btn.getAttribute('data-target');
      document.getElementById(targetId).classList.add('active');
      
      if (targetId === 'sec-devices') loadDevices();
      if (targetId === 'sec-dashboard') closeFolder(); 
    });
  });

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // ---- Toast Notification System ----
  window.showToast = (message, type = 'info') => {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? '<i class="fa-solid fa-circle-check"></i>' : '<i class="fa-solid fa-circle-info"></i>';
    toast.innerHTML = `${icon} <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  };

  // ---- Global Variables ----
  let allFiles = [];
  let customFolders = [];
  let currentContextMenuFile = null;

  // ---- Load Files & Folders ----
  async function loadFiles() {
    try {
      const res = await fetch('/files');
      if(res.status === 401) { window.location.href = '/login.html'; return; }
      const data = await res.json();
      allFiles = data.files || [];
      customFolders = data.folders || [];
      
      const storageBytes = data.storageUsed || 0;
      document.getElementById('storageAmount').innerText = formatBytes(storageBytes);
      
      const MAX_STORAGE = 5 * 1024 * 1024 * 1024; 
      const percentage = Math.min((storageBytes / MAX_STORAGE) * 100, 100);
      document.querySelector('.ripple-bg').style.height = `${percentage + 10}%`;

      renderFolders();

      if (document.getElementById('fileView').style.display === 'block') {
        openFolder(currentFolderType);
      }
    } catch (err) { console.error('Load files err', err); }
  }

  function renderFolders() {
    const grid = document.getElementById('folderView');
    // keep default folders intact, just remove custom ones and re-add
    const defaultFoldersHtml = `
      <div class="glass folder-card" onclick="openFolder('photo')">
        <i class="fa-solid fa-images"></i>
        <h3>Photos</h3>
      </div>
      <div class="glass folder-card" onclick="openFolder('video')">
        <i class="fa-solid fa-film"></i>
        <h3>Videos</h3>
      </div>
      <div class="glass folder-card" onclick="openFolder('audio')">
        <i class="fa-solid fa-music"></i>
        <h3>Audio</h3>
      </div>
      <div class="glass folder-card" onclick="openFolder('docs')">
        <i class="fa-solid fa-file-pdf"></i>
        <h3>Documents</h3>
      </div>
      <div class="glass folder-card" onclick="openFolder('text')">
        <i class="fa-solid fa-file-lines"></i>
        <h3>Notes</h3>
      </div>
    `;
    let customHtml = '';
    customFolders.forEach(folder => {
      customHtml += `
        <div class="glass folder-card" onclick="openFolder('${folder.id}', true)">
          <i class="fa-solid ${folder.icon}"></i>
          <h3>${folder.name}</h3>
        </div>
      `;
    });
    grid.innerHTML = defaultFoldersHtml + customHtml;
  }

  // ---- Folder Navigation & Thumbnails ----
  let currentFolderType = '';
  window.openFolder = (type, isCustom = false) => {
    currentFolderType = type;
    document.getElementById('folderView').style.display = 'none';
    const fileView = document.getElementById('fileView');
    fileView.style.display = 'block';
    
    if (isCustom) {
      const cFolder = customFolders.find(f => f.id === type);
      document.getElementById('currentFolderName').innerText = cFolder ? cFolder.name : 'Folder';
    } else {
      const titles = { photo: 'Photos', video: 'Videos', audio: 'Audio', docs: 'Documents', text: 'Notes' };
      document.getElementById('currentFolderName').innerText = titles[type] || 'Files';
    }
    
    const grid = document.getElementById('currentFileGrid');
    grid.innerHTML = '';
    
    let filteredFiles = [];
    if (isCustom) {
      filteredFiles = allFiles.filter(f => f.folderId === type);
    } else {
      filteredFiles = allFiles.filter(f => f.type === type && !f.folderId);
    }

    if (filteredFiles.length === 0) {
      grid.innerHTML = `<p style="color: var(--text-muted); grid-column: 1/-1; text-align: center;">No files in this folder.</p>`;
      return;
    }

    filteredFiles.forEach(f => {
      const card = document.createElement('div');
      card.className = 'file-card';
      const downloadUrl = `/download/${f.telegramFileId}`;

      let previewHtml = '';
      if (type === 'photo') previewHtml = `<img src="${downloadUrl}" alt="img"/>`;
      else if (type === 'video') previewHtml = `<video src="${downloadUrl}" preload="metadata"></video>`;
      else if (type === 'audio') previewHtml = `<i class="fa-solid fa-file-audio"></i>`;
      else if (type === 'text') previewHtml = `<i class="fa-solid fa-file-lines"></i>`;
      else previewHtml = `<i class="fa-solid fa-file-pdf"></i>`;

      card.innerHTML = `<div class="file-preview-box">${previewHtml}</div>`;
      
      // Left Click -> Open Media Viewer
      card.addEventListener('click', () => {
        openMediaViewer(f, downloadUrl);
      });

      // Right Click -> Custom Context Menu
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        currentContextMenuFile = { ...f, url: downloadUrl };
        showContextMenu(e.pageX, e.pageY);
      });

      grid.appendChild(card);
    });
  };

  window.closeFolder = () => {
    document.getElementById('fileView').style.display = 'none';
    document.getElementById('folderView').style.display = 'grid';
  };

  // ---- Custom Context Menu ----
  const contextMenu = document.getElementById('customContextMenu');
  
  function showContextMenu(x, y) {
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.classList.add('active');
  }

  document.addEventListener('click', () => {
    contextMenu.classList.remove('active');
  });

  document.getElementById('menuViewDetails').addEventListener('click', () => {
    if(!currentContextMenuFile) return;
    document.getElementById('metaFilename').innerText = currentContextMenuFile.name;
    document.getElementById('metaType').innerText = currentContextMenuFile.type;
    document.getElementById('metaSize').innerText = formatBytes(currentContextMenuFile.size);
    document.getElementById('metaDate').innerText = new Date(currentContextMenuFile.uploadedAt).toLocaleString();
    document.getElementById('metaModal').classList.add('active');
  });

  window.closeMetaModal = () => document.getElementById('metaModal').classList.remove('active');

  document.getElementById('menuOpenTab').addEventListener('click', () => {
    if(currentContextMenuFile) window.open(currentContextMenuFile.url, '_blank');
  });

  document.getElementById('menuDownload').addEventListener('click', () => {
    if(!currentContextMenuFile) return;
    const a = document.createElement('a');
    a.href = currentContextMenuFile.url;
    a.download = currentContextMenuFile.name;
    a.click();
  });

  // ---- Rename Logic ----
  document.getElementById('menuRename').addEventListener('click', () => {
    if(!currentContextMenuFile) return;
    document.getElementById('renameInput').value = currentContextMenuFile.name;
    document.getElementById('renameModal').classList.add('active');
  });

  window.closeRenameModal = () => document.getElementById('renameModal').classList.remove('active');

  document.getElementById('confirmRenameBtn').addEventListener('click', async () => {
    const newName = document.getElementById('renameInput').value;
    if (!newName) return;
    
    const btn = document.getElementById('confirmRenameBtn');
    btn.innerHTML = 'Saving...'; btn.disabled = true;
    
    try {
      const res = await fetch('/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentContextMenuFile.telegramFileId, newName })
      });
      if(res.ok) {
        showToast('File Renamed', 'success');
        await loadFiles();
        closeRenameModal();
      }
    } catch(e) { showToast('Rename Error', 'error'); }
    btn.innerHTML = 'Save'; btn.disabled = false;
  });

  // ---- Create Folder Logic ----
  window.openCreateFolderModal = () => document.getElementById('createFolderModal').classList.add('active');
  window.closeCreateFolderModal = () => document.getElementById('createFolderModal').classList.remove('active');

  document.getElementById('confirmCreateFolderBtn').addEventListener('click', async () => {
    const name = document.getElementById('folderNameInput').value;
    if (!name) return;
    
    const btn = document.getElementById('confirmCreateFolderBtn');
    btn.innerHTML = 'Creating...'; btn.disabled = true;
    
    try {
      const res = await fetch('/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if(res.ok) {
        showToast('Folder Created', 'success');
        document.getElementById('folderNameInput').value = '';
        await loadFiles();
        closeCreateFolderModal();
      }
    } catch(e) { showToast('Error creating folder', 'error'); }
    btn.innerHTML = 'Create'; btn.disabled = false;
  });

  // ---- Media Viewer (Lightbox) ----
  const mediaViewerModal = document.getElementById('mediaViewerModal');
  const mediaViewerContent = document.getElementById('mediaViewerContent');
  
  function openMediaViewer(file, url) {
    document.getElementById('mediaViewerTitle').innerText = file.name;
    document.getElementById('mediaViewerNewTab').onclick = () => window.open(`${url}?inline=true`, '_blank');
    
    document.getElementById('mediaViewerDownload').onclick = () => {
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
    };

    let contentHtml = '';
    if (file.type === 'photo') {
      contentHtml = `<img src="${url}?inline=true" alt="${file.name}">`;
    } else if (file.type === 'video') {
      contentHtml = `<video src="${url}?inline=true" controls autoplay></video>`;
    } else if (file.type === 'audio') {
      contentHtml = `<audio src="${url}?inline=true" controls autoplay></audio>`;
    } else {
      contentHtml = `<iframe src="${url}?inline=true" style="width:100%; height:80vh; border:none; border-radius:12px; background:white;"></iframe>`;
    }

    mediaViewerContent.innerHTML = contentHtml;
    mediaViewerModal.classList.add('active');
  }

  window.closeMediaViewer = () => {
    mediaViewerContent.innerHTML = ''; // stops playing media
    mediaViewerModal.classList.remove('active');
  };

  // ---- Universal Uploader ----
  const uploadZone = document.getElementById('uploadZone');
  const fileInput = document.getElementById('fileInput');

  uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.style.borderColor = 'var(--primary)'; });
  uploadZone.addEventListener('dragleave', () => { uploadZone.style.borderColor = 'var(--glass-border)'; });
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = 'var(--glass-border)';
    if(e.dataTransfer.files.length) handleUploads(e.dataTransfer.files);
  });
  fileInput.addEventListener('change', () => {
    if(fileInput.files.length) handleUploads(fileInput.files);
  });

  async function handleUploads(files) {
    for (let i = 0; i < files.length; i++) {
      showToast(`Uploading ${files[i].name}...`, 'info');
      const formData = new FormData();
      formData.append('file', files[i]);
      
      // If currently inside a custom folder, append folderId
      if (currentFolderType && customFolders.find(f => f.id === currentFolderType)) {
        formData.append('folderId', currentFolderType);
      }
      
      try {
        const res = await fetch('/upload', { method: 'POST', body: formData });
        if(res.ok) {
          showToast(`${files[i].name} uploaded successfully!`, 'success');
        } else {
          showToast(`Failed to upload ${files[i].name}`, 'error');
        }
      } catch (e) { showToast(`Upload Error`, 'error'); }
    }
    fileInput.value = '';
    await loadFiles();
  }

  // ---- Notepad ----
  document.getElementById('saveNoteBtn').addEventListener('click', async () => {
    const title = document.getElementById('noteTitle').value || 'Untitled Note';
    const contentHtml = document.getElementById('notepad-editor').innerHTML;
    if (!contentHtml.trim()) return alert('Note is empty!');

    const btn = document.getElementById('saveNoteBtn');
    const ogHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;
    showToast(`Saving Note...`, 'info');

    try {
      const res = await fetch('/save-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content: contentHtml })
      });
      if(res.ok) {
        document.getElementById('noteTitle').value = '';
        document.getElementById('notepad-editor').innerHTML = '';
        showToast(`Note Saved!`, 'success');
        await loadFiles();
        document.querySelector('[data-target="sec-dashboard"]').click();
        openFolder('text');
      }
    } catch (e) {}
    btn.innerHTML = ogHtml;
    btn.disabled = false;
  });

  // ---- Profile Logic ----
  let currentProfilePicUrl = 'https://ui-avatars.com/api/?name=User';

  async function loadProfile() {
    try {
      const res = await fetch('/profile');
      if (res.ok) {
        const data = await res.json();
        if(data.fullname) {
          document.getElementById('p_fullname').value = data.fullname;
          document.getElementById('formProfileName').innerText = data.fullname;
          document.getElementById('topProfileName').innerText = data.fullname.split(' ')[0];
        }
        if(data.nid) document.getElementById('p_nid').value = data.nid;
        if(data.dob) document.getElementById('p_dob').value = data.dob;
        if(data.gender) document.getElementById('p_gender').value = data.gender;
        if(data.father) document.getElementById('p_father').value = data.father;
        if(data.mother) document.getElementById('p_mother').value = data.mother;
        if(data.present_addr) document.getElementById('p_present_addr').value = data.present_addr;
        if(data.permanent_addr) document.getElementById('p_permanent_addr').value = data.permanent_addr;
        
        if(data.profilePicUrl) {
          currentProfilePicUrl = data.profilePicUrl;
          document.getElementById('formProfilePic').src = currentProfilePicUrl;
          document.getElementById('topProfilePic').src = currentProfilePicUrl;
        }
      }
    } catch(e) {}
  }

  document.getElementById('picInput').addEventListener('change', function() {
    if (this.files && this.files[0]) {
      const reader = new FileReader();
      reader.onload = (e) => document.getElementById('formProfilePic').src = e.target.result;
      reader.readAsDataURL(this.files[0]);
    }
  });

  document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveProfileBtn');
    const ogHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...';
    btn.disabled = true;

    const payload = {
      fullname: document.getElementById('p_fullname').value,
      nid: document.getElementById('p_nid').value,
      dob: document.getElementById('p_dob').value,
      gender: document.getElementById('p_gender').value,
      father: document.getElementById('p_father').value,
      mother: document.getElementById('p_mother').value,
      present_addr: document.getElementById('p_present_addr').value,
      permanent_addr: document.getElementById('p_permanent_addr').value,
    };

    const formData = new FormData();
    formData.append('profileData', JSON.stringify(payload));
    const picFile = document.getElementById('picInput').files[0];
    if (picFile) formData.append('profilePic', picFile);

    try {
      const res = await fetch('/profile', { method: 'POST', body: formData });
      const data = await res.json();
      if(data.success && data.profile) {
        showToast('Profile Updated Successfully', 'success');
        if(data.profile.profilePicUrl) {
           document.getElementById('topProfilePic').src = data.profile.profilePicUrl;
        }
        document.getElementById('topProfileName').innerText = payload.fullname ? payload.fullname.split(' ')[0] : 'Admin';
        document.getElementById('formProfileName').innerText = payload.fullname || 'Admin';
      }
    } catch(e) {}
    btn.innerHTML = ogHtml; btn.disabled = false;
  });

  // ---- Device Tracker ----
  async function loadDevices() {
    const list = document.getElementById('deviceList');
    list.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Fetching active sessions...';
    try {
      const res = await fetch('/active-devices');
      const data = await res.json();
      list.innerHTML = '';
      if(data.devices && data.devices.length > 0) {
        data.devices.forEach(dev => {
          const isActive = (Date.now() - dev.lastActive) < 5000 ? 'active' : '';
          const icon = dev.device.includes('iPhone') || dev.device.includes('Android') ? 'fa-mobile-screen' : 'fa-laptop';
          
          list.innerHTML += `
            <div class="device-item ${isActive}">
              <div class="info">
                <i class="fa-solid ${icon}"></i>
                <div>
                  <h4>${dev.device}</h4>
                  <p>IP: ${dev.ip || 'Unknown'} • Login: ${new Date(dev.loginTime).toLocaleString()}</p>
                </div>
              </div>
              <span style="color: ${isActive ? 'var(--success)' : 'var(--text-muted)'}; font-size: 0.9rem;">
                ${isActive ? '● Online' : 'Active recently'}
              </span>
            </div>
          `;
        });
      } else {
        list.innerHTML = '<p>No active sessions found.</p>';
      }
    } catch (err) {
      list.innerHTML = '<p>Error loading sessions.</p>';
    }
  }

  // Initialization
  loadFiles();
  loadProfile();
});
