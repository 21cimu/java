// user center page script
(function(){
  const ctx = window.location.pathname.replace(/\/[^/]*$/, '') || '';
  const base = window.location.origin + ctx;

  function el(id){ return document.getElementById(id); }

  async function init(){
    bindEvents();
    await loadUser();
  }

  function bindEvents(){
    const avatarFile = el('avatarFile');
    if (avatarFile) avatarFile.addEventListener('change', onAvatarChange);
    const removeBtn = el('removeAvatarBtn'); if (removeBtn) removeBtn.addEventListener('click', removeAvatar);
    const saveBtn = el('saveBtn'); if (saveBtn) saveBtn.addEventListener('click', onSave);
    const cancelBtn = el('cancelBtn'); if (cancelBtn) cancelBtn.addEventListener('click', () => { window.history.back(); });
    const logoutBtn = el('logoutBtn'); if (logoutBtn) logoutBtn.addEventListener('click', onLogout);
  }

  async function loadUser(){
    try{
      try { window.__appTrace && window.__appTrace('user.loadUser: start'); } catch(e){}
      const resp = await fetch(base + '/api/user');
      try { window.__appTrace && window.__appTrace('user.loadUser: fetched /api/user status=' + resp.status); } catch(e){}
      const data = await resp.json();
      if (!data || !data.success) {
        // not logged in or error -> redirect to login
        window.location.href = base + '/login.html';
        return;
      }
      const user = data.user || {};
      el('avatarImg').src = user.avatar || el('avatarImg').src;
      el('displayName').textContent = user.username || '用户';
      el('userId').textContent = 'ID: ' + (user.id || '-');
      el('usernameInput').value = user.username || '';
      // store id
      el('usernameInput').setAttribute('data-user-id', user.id || '');
      try { window.__appTrace && window.__appTrace('user.loadUser: render done'); } catch(e){}
    }catch(e){
      console.debug('loadUser error', e);
      // redirect to login as fallback
      window.location.href = base + '/login.html';
    }
  }

  function onAvatarChange(e){
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { try { window.notify && window.notify.error('请选择图片文件'); } catch (e) { alert('请选择图片文件'); } return; }
    const reader = new FileReader();
    reader.onload = function(ev){ el('avatarImg').src = ev.target.result; el('avatarImg').setAttribute('data-durl', ev.target.result); };
    reader.readAsDataURL(f);
  }

  function removeAvatar(){
    // set to default empty avatar (server should accept null to remove)
    el('avatarImg').src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="%231976D2"/><circle cx="32" cy="22" r="12" fill="%23ffffff"/><rect x="8" y="40" width="48" height="12" rx="6" fill="%23ffffff"/></svg>';
    el('avatarImg').removeAttribute('data-durl');
    // also clear file input
    const f = el('avatarFile'); if (f) f.value = '';
  }

  async function onSave(){
    const username = el('usernameInput').value.trim();
    const currentPwd = el('currentPwd').value || '';
    const newPwd = el('newPwd').value || '';
    const confirmPwd = el('confirmPwd').value || '';

    if (!username) { try { window.notify && window.notify.error('用户名不能为空'); } catch (e) { alert('用户名不能为空'); } return; }
    if (newPwd || confirmPwd) {
      if (newPwd !== confirmPwd) { try { window.notify && window.notify.error('两次输入的新密码不一致'); } catch (e) { alert('两次输入的新密码不一致'); } return; }
      if (!currentPwd) { try { window.notify && window.notify.error('修改密码需要输入当前密码'); } catch (e) { alert('修改密码需要输入当前密码'); } return; }
      if (newPwd.length < 6) { try { window.notify && window.notify.error('新密码长度至少为 6 字符'); } catch (e) { alert('新密码长度至少为 6 字符'); } return; }
    }

    // build payload
    const payload = { username };
    // avatar: prefer data-durl if user selected new image; if explicitly removed, send empty string
    const avatarEl = el('avatarImg');
    if (avatarEl.getAttribute('data-durl')) payload.avatar = avatarEl.getAttribute('data-durl');
    else if (!avatarEl.src || avatarEl.src.indexOf('data:image') === -1) payload.avatar = avatarEl.src; // server may accept full URL
    else {
      // if avatar is default svg data URI, treat as null (no avatar)
      payload.avatar = null;
    }

    if (newPwd) payload.password = newPwd;
    if (currentPwd && newPwd) payload.currentPassword = currentPwd;

    try{
      const resp = await fetch(base + '/api/user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      try { window.__appTrace && window.__appTrace('user.onSave: POST /api/user sent'); } catch(e){}
      const data = await resp.json();
      if (data && data.success) {
        // 使用 notify 替换 alert
        try { window.notify && window.notify.success('保存成功'); } catch (e) {}
        // redirect back to app main page
        window.location.href = base + '/index.html';
      } else {
        try { window.notify && window.notify.error('保存失败: ' + (data && data.message ? data.message : '未知错误')); } catch (e) { alert('保存失败: ' + (data && data.message ? data.message : '未知错误')); }
      }
    }catch(e){
      console.debug('save error', e);
      try { window.__appTrace && window.__appTrace('user.onSave: exception ' + (e && e.message)); } catch(e2){}
      try { window.notify && window.notify.error('请求失败: ' + e.message); } catch (err) { alert('请求失败: ' + e.message); }
    }
  }

  async function onLogout(){
    try{
      await fetch(base + '/api/auth?action=logout', { method: 'POST' });
    }catch(e){}
    // queue notify to show on login page
    try { localStorage.setItem('lastNotify', JSON.stringify({ type: 'info', message: '已登出' })); } catch (e) {}
    window.location.href = base + '/login.html';
  }

  document.addEventListener('DOMContentLoaded', init);
})();
