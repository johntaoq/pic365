import React, { useEffect, useMemo, useState } from 'react';
import { Check, Layers3, LoaderCircle, Plus, Save, Trash2, X } from 'lucide-react';

const EMPTY_CHANNELS = Object.freeze({ image: [], video: [], chat: [] });

function draftFromGroup(group) {
  return {
    id: group?.id || '',
    name: group?.name || '',
    description: group?.description || '',
    channels: {
      image: [...(group?.channels?.image || [])],
      video: [...(group?.channels?.video || [])],
      chat: [...(group?.channels?.chat || [])]
    }
  };
}

function headersFor(session, json = false) {
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
  };
}

export default function AdminSystemGroups({ language = 'zh', session, onGroupsChanged }) {
  const zh = language === 'zh';
  const [groups, setGroups] = useState([]);
  const [channels, setChannels] = useState(EMPTY_CHANNELS);
  const [draft, setDraft] = useState(() => draftFromGroup());
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');
  const selectedGroup = useMemo(() => groups.find((group) => group.id === draft.id) || null, [groups, draft.id]);

  function applyPayload(payload, preferredId = '') {
    const nextGroups = Array.isArray(payload.groups) ? payload.groups : [];
    const nextChannels = payload.channels && typeof payload.channels === 'object' ? payload.channels : EMPTY_CHANNELS;
    setGroups(nextGroups);
    setChannels(nextChannels);
    onGroupsChanged?.(nextGroups);
    const selected = nextGroups.find((group) => group.id === preferredId)
      || nextGroups.find((group) => group.id === draft.id)
      || nextGroups[0];
    setDraft(draftFromGroup(selected));
  }

  async function load() {
    setStatus('loading');
    setMessage('');
    try {
      const response = await fetch('/api/admin/system-groups', { headers: headersFor(session), cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'SYSTEM_GROUP_LOAD_FAILED');
      applyPayload(payload);
      setStatus('idle');
    } catch (error) {
      setStatus('error');
      setMessage(zh ? `系统分组加载失败：${error.message}` : `System groups failed to load: ${error.message}`);
    }
  }

  useEffect(() => { void load(); }, []);

  function toggleChannel(channelType, channelId) {
    setDraft((current) => {
      const selected = new Set(current.channels[channelType] || []);
      if (selected.has(channelId)) selected.delete(channelId); else selected.add(channelId);
      return { ...current, channels: { ...current.channels, [channelType]: [...selected] } };
    });
  }

  async function save(event) {
    event.preventDefault();
    if (!draft.name.trim()) return setMessage(zh ? '请输入分组名称。' : 'Enter a group name.');
    setStatus('saving');
    setMessage('');
    try {
      const response = await fetch('/api/admin/system-groups', {
        method: draft.id ? 'PATCH' : 'POST',
        headers: headersFor(session, true),
        body: JSON.stringify(draft)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'SYSTEM_GROUP_UPDATE_FAILED');
      applyPayload(payload, payload.group?.id);
      setStatus('success');
      setMessage(zh ? '系统分组已保存。' : 'System group saved.');
    } catch (error) {
      setStatus('error');
      setMessage(zh ? `系统分组保存失败：${error.message}` : `System group could not be saved: ${error.message}`);
    }
  }

  async function remove() {
    if (!selectedGroup || selectedGroup.isDefault) return;
    if (!globalThis.confirm(zh ? `删除“${selectedGroup.name}”？其中用户将移回默认组。` : `Delete “${selectedGroup.name}”? Its users will move to the default group.`)) return;
    setStatus('saving');
    setMessage('');
    try {
      const response = await fetch('/api/admin/system-groups', {
        method: 'DELETE',
        headers: headersFor(session, true),
        body: JSON.stringify({ id: selectedGroup.id })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'SYSTEM_GROUP_DELETE_FAILED');
      applyPayload(payload);
      setStatus('success');
      setMessage(zh ? '分组已删除，组内用户已移回默认组。' : 'Group deleted; its users were moved to the default group.');
    } catch (error) {
      setStatus('error');
      setMessage(zh ? `系统分组删除失败：${error.message}` : `System group could not be deleted: ${error.message}`);
    }
  }

  const sections = [
    { type: 'image', label: zh ? '图片渠道' : 'Image channels' },
    { type: 'video', label: zh ? '视频渠道' : 'Video channels' },
    { type: 'chat', label: zh ? '对话与 AI 工具渠道' : 'Chat and AI tool channels' }
  ];

  return <section className="adminBlock adminSystemGroups">
    <div className="adminSectionHeading">
      <div><h3><Layers3 size={18} />{zh ? '普通用户系统分组' : 'User system groups'}</h3><p>{zh ? '普通用户只能看见并使用所属分组已绑定的渠道；管理员角色不受此限制。' : 'Users can only enumerate and use channels bound to their group. Administrative roles bypass this restriction.'}</p></div>
      <button className="adminProviderAction adminProviderCancel" type="button" onClick={() => { setDraft(draftFromGroup()); setMessage(''); }}><Plus size={15} />{zh ? '新增分组' : 'Add group'}</button>
    </div>
    <div className="adminSystemGroupLayout">
      <nav className="adminSystemGroupList" aria-label={zh ? '系统分组' : 'System groups'}>
        {groups.map((group) => <button className={draft.id === group.id ? 'active' : ''} type="button" key={group.id} onClick={() => { setDraft(draftFromGroup(group)); setMessage(''); }}>
          <span><strong>{group.name}</strong><small>{group.memberCount} {zh ? '名用户' : 'users'}</small></span>
          {group.isDefault ? <i>{zh ? '默认' : 'Default'}</i> : null}
        </button>)}
      </nav>
      <form className="adminSystemGroupEditor" onSubmit={save}>
        <div className="adminSystemGroupFields">
          <label><span>{zh ? '分组名称' : 'Group name'}</span><input value={draft.name} maxLength={80} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
          <label><span>{zh ? '说明' : 'Description'}</span><input value={draft.description} maxLength={500} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label>
        </div>
        <div className="adminSystemChannelSections">
          {sections.map((section) => <fieldset key={section.type}>
            <legend>{section.label}<small>{draft.channels[section.type]?.length || 0}/{channels[section.type]?.length || 0}</small></legend>
            <div className="adminSystemChannelGrid">
              {(channels[section.type] || []).length ? channels[section.type].map((channel) => {
                const checked = draft.channels[section.type]?.includes(channel.id) === true;
                return <label className={`${checked ? 'selected' : ''} ${channel.enabled ? '' : 'disabled'}`} key={channel.id}>
                  <input type="checkbox" checked={checked} onChange={() => toggleChannel(section.type, channel.id)} />
                  <span title={`${channel.model || ''} · ${channel.id}`}><strong>{channel.name}</strong><small>{channel.model || '-'} · ID {channel.id}{channel.enabled ? '' : ` · ${zh ? '已停用' : 'Disabled'}`}</small></span>
                  {checked ? <Check size={15} /> : null}
                </label>;
              }) : <p>{zh ? '暂无渠道' : 'No channels'}</p>}
            </div>
          </fieldset>)}
        </div>
        <footer>
          <span>{draft.id ? `${zh ? '成员' : 'Members'}：${selectedGroup?.memberCount || 0}` : (zh ? '新分组默认不开放任何渠道。' : 'New groups start with no channels.')}</span>
          <div>
            {selectedGroup && !selectedGroup.isDefault ? <button className="adminProviderAction adminProviderRemove" type="button" onClick={() => void remove()} disabled={status === 'saving'}><Trash2 size={15} />{zh ? '删除分组' : 'Delete'}</button> : null}
            {draft.id ? <button className="adminProviderAction adminProviderCancel" type="button" onClick={() => setDraft(draftFromGroup(selectedGroup))}><X size={15} />{zh ? '撤销' : 'Reset'}</button> : null}
            <button className="adminProviderAction adminProviderSave" type="submit" disabled={status === 'saving'}>{status === 'saving' ? <LoaderCircle className="spinIcon" size={15} /> : <Save size={15} />}{zh ? '保存分组' : 'Save group'}</button>
          </div>
        </footer>
      </form>
    </div>
    {message ? <p className={`adminNotice ${status === 'error' ? 'error' : ''}`}>{message}</p> : null}
  </section>;
}
