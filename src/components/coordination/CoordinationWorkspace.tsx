'use client';

import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import { AUTHORITIES, DOMAINS, MESSAGE_KINDS } from '@/coordination/types';
import type { BoardMessage, CoordinationCommand, CoordinationSnapshot, MessageDraft, Participant } from '@/coordination/types';
import { Section } from '@/components/primitives/Section';

const fieldClass = 'surface-inset px-2 py-1.5 text-[13px] w-full';
const muted = { color: 'var(--text-secondary)' };
const blankDraft = (authorId: string): MessageDraft => ({ requestId: '', authorId, recipientId: null, kind: 'NOTE', topic: '', title: '', body: '', context: null, replyTo: null });
const commaValues = (value: FormDataEntryValue | null) => String(value ?? '').split(',').map((part) => part.trim()).filter(Boolean);

function Tag({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return <span className="pill" style={{ color: accent ? 'var(--accent)' : 'var(--text-muted)' }}>{children}</span>;
}

function MessageContext({ message }: { message: BoardMessage }) {
  if (!message.context) return null;
  const context = message.context;
  return <div className="surface-inset p-2 text-[12px] flex flex-wrap gap-x-3 gap-y-1" aria-label={`Release context for ${message.id}`}>
    <span>{context.domain}</span>
    <Link href={`/releases/${encodeURIComponent(context.releaseId)}`} className="id" style={{ color: 'var(--info)' }}>{context.releaseId}</Link>
    <span className="id">Build {context.buildId}</span>
    <span className="ts">Known at {context.knownAt}</span>
  </div>;
}

function threadRoot(message: BoardMessage, messages: BoardMessage[]) {
  let current = message;
  const visited = new Set([current.id]);
  while (current.replyTo) {
    const parent = messages.find((candidate) => candidate.id === current.replyTo);
    if (!parent || visited.has(parent.id)) break;
    visited.add(parent.id);
    current = parent;
  }
  return current.id;
}

export function CoordinationWorkspace({ initial, view }: { initial: CoordinationSnapshot; view: 'stable' | 'board' }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [search, setSearch] = useState('');
  const [participantKind, setParticipantKind] = useState('ALL');
  const [messageKind, setMessageKind] = useState('ALL');
  const [topic, setTopic] = useState('ALL');
  const [draft, setDraft] = useState<MessageDraft>(() => blankDraft(initial.participants[0]?.id ?? ''));
  const [acknowledgers, setAcknowledgers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const participantName = (id: string) => snapshot.participants.find((participant) => participant.id === id)?.name ?? id;
  const participants = useMemo(() => snapshot.participants.filter((participant) =>
    (participantKind === 'ALL' || participant.kind === participantKind) &&
    [participant.id, participant.name, participant.purpose, participant.runtime, ...participant.capabilities, ...participant.inputs, ...participant.outputs].join(' ').toLowerCase().includes(search.toLowerCase())
  ), [snapshot.participants, participantKind, search]);
  const messages = useMemo(() => snapshot.messages.filter((message) =>
    (messageKind === 'ALL' || message.kind === messageKind) && (topic === 'ALL' || message.topic === topic)
  ).sort((a, b) => a.sequence - b.sequence), [snapshot.messages, messageKind, topic]);
  const topics = [...new Set(snapshot.messages.map((message) => message.topic))].sort();

  async function request(command?: CoordinationCommand): Promise<boolean> {
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      const response = await fetch('/api/coordination', command ? {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command),
      } : { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error([body.error, body.detail].filter(Boolean).join(': ') || 'Coordination request failed.');
      setSnapshot(body as CoordinationSnapshot);
      setNotice(command ? 'Saved in the local coordination sandbox.' : 'Coordination refreshed.');
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Coordination request failed. Please retry.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  function updateDraft(update: Partial<MessageDraft>) {
    setDraft((previous) => ({ ...previous, ...update, requestId: '' }));
  }

  async function postMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitted = { ...draft, requestId: draft.requestId || crypto.randomUUID() };
    setDraft(submitted);
    if (await request({ operation: 'post', message: submitted })) {
      setDraft(blankDraft(submitted.authorId));
      setTopic('ALL');
      setMessageKind('ALL');
    }
  }

  function reply(message: BoardMessage) {
    const author = draft.authorId === message.authorId
      ? snapshot.participants.find((participant) => participant.id !== message.authorId)?.id ?? ''
      : draft.authorId;
    setDraft({ ...blankDraft(author), recipientId: message.authorId, topic: message.topic, title: `Re: ${message.title}`,
      context: message.context, replyTo: message.id });
    document.getElementById('message-composer')?.scrollIntoView?.({ block: 'start' });
    document.getElementById('message-body')?.focus();
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const participant: Participant = {
      id: String(data.get('id') ?? '').trim(), name: String(data.get('name') ?? '').trim(),
      purpose: String(data.get('purpose') ?? '').trim(), kind: data.get('kind') as Participant['kind'],
      runtime: data.get('runtime') as Participant['runtime'], authority: data.get('authority') as Participant['authority'],
      domains: data.getAll('domains') as Participant['domains'], inputs: commaValues(data.get('inputs')),
      outputs: commaValues(data.get('outputs')), capabilities: commaValues(data.get('capabilities')),
      version: '0.1.0', scope: snapshot.scope, status: 'LOCAL', reference: 'Local registration',
    };
    if (await request({ operation: 'register', participant })) form.reset();
  }

  return <div className="p-3 sm:p-4 max-w-[1180px] mx-auto w-full flex flex-col gap-4">
    <div className="surface-inset px-3 py-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px]" style={muted}>
      <span style={{ color: 'var(--accent)' }}>Demonstration coordination</span>
      <span>No agents are launched by this board.</span>
      <span className="mono">Scope: {snapshot.scope}</span>
    </div>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1 max-w-[850px]">
        <p className="label-sm m-0">Payload OS · Coordination</p>
        <h1 className="m-0 text-[22px] font-semibold" style={{ color: 'var(--text-heading)' }}>{view === 'stable' ? 'Agent & apparatus stable' : 'Message board'}</h1>
        <p className="m-0 text-[13px]" style={muted}>{view === 'stable'
          ? 'A shared register of agents and apparatuses: their purpose, declared contracts and working relationships across the information-production system.'
          : 'A shared record of requests, handoffs, blockers and results, with named participants and release context.'}</p>
      </div>
      <button type="button" className="btn" onClick={() => void request()} disabled={busy}>Refresh</button>
    </header>
    <div className="surface px-3 py-2 text-[12.5px] flex flex-wrap gap-x-3 gap-y-1" style={muted}>
      <Tag accent={snapshot.canWrite}>{snapshot.mode === 'LOCAL_SANDBOX' ? 'LOCAL SANDBOX' : 'READ ONLY'}</Tag>
      <span>{snapshot.canWrite
        ? 'Local definitions, messages and receipts persist in a server file. Participant selection is a demonstration identity, not authentication.'
        : <>Enable local coordination with <code className="mono">npm run dev:coordination</code>.</>}</span>
    </div>
    {error && <p role="alert" className="surface p-3 m-0" style={{ color: 'var(--status-refused)' }}>{error} Your unsaved input has been retained.</p>}
    <div role="status" aria-live="polite" className={notice ? 'text-[12px]' : 'sr-only'} style={muted}>{notice}</div>

    {view === 'stable' ? <>
      <form className="surface p-3 flex flex-wrap items-end gap-3" aria-label="Stable filters" onSubmit={(event) => event.preventDefault()}>
        <label className="flex flex-col gap-1 grow"><span className="label-sm">Search the stable</span><input className={fieldClass} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, purpose, capability or contract" /></label>
        <label className="flex flex-col gap-1 min-w-[150px]"><span className="label-sm">Participant kind</span><select className={fieldClass} value={participantKind} onChange={(event) => setParticipantKind(event.target.value)}><option value="ALL">All participants</option><option value="AGENT">Agents</option><option value="APPARATUS">Apparatuses</option></select></label>
        <span className="label-sm pb-2">{participants.length} of {snapshot.participants.length} definitions</span>
      </form>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {participants.map((participant) => {
          const connections = snapshot.connections.filter((connection) => connection.sourceId === participant.id || connection.targetId === participant.id);
          return <article key={participant.id} aria-label={`Participant ${participant.name}`} className="surface p-3 flex flex-col gap-3 min-w-0">
            <header className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="label-sm m-0 mb-1">{participant.kind}</p><h2 className="text-[16px] font-semibold m-0">{participant.name}</h2><span className="id" style={muted}>{participant.id}</span></div>
              <Tag accent={participant.status === 'LOCAL'}>{participant.status}</Tag>
            </header>
            <p className="m-0 text-[13px]" style={muted}>{participant.purpose}</p>
            <dl className="kv text-[12.5px] m-0">
              <dt>Runtime / version</dt><dd>{participant.runtime} <span className="mono">{participant.version}</span></dd>
              <dt>Declared authority</dt><dd>{participant.authority}</dd>
              <dt>Domains</dt><dd>{participant.domains.join(' · ') || 'Shared'}</dd>
              <dt>Inputs</dt><dd className="mono">{participant.inputs.join(', ') || 'None declared'}</dd>
              <dt>Outputs</dt><dd className="mono">{participant.outputs.join(', ') || 'None declared'}</dd>
              <dt>Capabilities</dt><dd>{participant.capabilities.join(', ') || 'None declared'}</dd>
              <dt>Reference</dt><dd className="mono">{participant.reference}</dd>
            </dl>
            <details className="surface-inset p-2 mt-auto">
              <summary className="text-[12.5px]">Synastry · {connections.length} declared connections</summary>
              <p className="text-[12px] mt-2 mb-0" style={muted}>Contract compatibility indicates how definitions can work together. It does not attest deployment or authorize execution.</p>
              <ul className="list-none p-0 m-0 mt-2 flex flex-col gap-2">
                {connections.map((connection) => <li key={`${connection.sourceId}:${connection.targetId}`} className="border-t pt-2 text-[12px]" style={{ borderColor: 'var(--border-subtle)' }}>
                  <div className="flex flex-wrap items-center gap-2"><span>{participantName(connection.sourceId)} → {participantName(connection.targetId)}</span><Tag accent={connection.status === 'MATCH'}>{connection.status}</Tag></div>
                  <p className="m-0 mt-1 mono break-words">Contracts: {connection.contracts.join(', ')}</p>
                  <p className="m-0 mt-1" style={muted}>Domains: {connection.domains.join(' · ') || 'Shared'}</p>
                  {connection.missingInputs.length > 0 && <p className="m-0 mt-1" style={{ color: 'var(--accent)' }}>Missing inputs: <span className="mono">{connection.missingInputs.join(', ')}</span></p>}
                </li>)}
                {connections.length === 0 && <li className="text-[12px]" style={muted}>No compatible declared contracts in this scope.</li>}
              </ul>
            </details>
          </article>;
        })}
      </div>
      {participants.length === 0 && <p className="surface p-3 m-0" style={muted}>No definitions match these filters.</p>}
      {snapshot.canWrite && <Section title="Register a local definition" id="local-registration">
        <form aria-label="Register participant" className="surface p-3" onSubmit={register}>
          <p className="m-0 mb-3 text-[12.5px]" style={muted}>Register a version 0.1.0 definition in this sandbox. This records a declared role and contracts; it does not launch a process or grant authority.</p>
          <fieldset disabled={busy} className="border-0 p-0 m-0 grid grid-cols-1 md:grid-cols-3 gap-3 min-w-0">
            <label className="flex flex-col gap-1"><span className="label-sm">Participant ID</span><input className={fieldClass} name="id" required maxLength={100} /></label>
            <label className="flex flex-col gap-1"><span className="label-sm">Name</span><input className={fieldClass} name="name" required maxLength={160} /></label>
            <label className="flex flex-col gap-1"><span className="label-sm">Kind</span><select className={fieldClass} name="kind"><option value="AGENT">Agent</option><option value="APPARATUS">Apparatus</option></select></label>
            <label className="flex flex-col gap-1 md:col-span-3"><span className="label-sm">Purpose</span><textarea className={fieldClass} name="purpose" required rows={2} maxLength={1000} /></label>
            <label className="flex flex-col gap-1"><span className="label-sm">Runtime</span><select className={fieldClass} name="runtime">{['Unassigned', 'Rust', 'C++', 'Python', 'JavaScript'].map((runtime) => <option key={runtime}>{runtime}</option>)}</select></label>
            <label className="flex flex-col gap-1"><span className="label-sm">Declared authority</span><select className={fieldClass} name="authority" defaultValue="coordination">{AUTHORITIES.map((authority) => <option key={authority}>{authority}</option>)}</select></label>
            <fieldset className="border-0 m-0 p-0 min-w-0"><legend className="label-sm mb-2">Domains · select at least one</legend><div className="flex flex-wrap gap-2">{DOMAINS.map((domain) => <label key={domain} className="text-[12px] flex items-center gap-1"><input type="checkbox" name="domains" value={domain} defaultChecked={domain === 'CARAVAN'} />{domain}</label>)}</div></fieldset>
            <label className="flex flex-col gap-1"><span className="label-sm">Input contracts · comma separated</span><input className={fieldClass} name="inputs" /></label>
            <label className="flex flex-col gap-1"><span className="label-sm">Output contracts · comma separated</span><input className={fieldClass} name="outputs" /></label>
            <label className="flex flex-col gap-1"><span className="label-sm">Capabilities · comma separated</span><input className={fieldClass} name="capabilities" /></label>
            <div className="md:col-span-3"><button className="btn btn-primary" type="submit">Register definition</button></div>
          </fieldset>
        </form>
      </Section>}
    </> : <>
      <form className="surface p-3 flex flex-wrap gap-3" aria-label="Board filters" onSubmit={(event) => event.preventDefault()}>
        <label className="flex flex-col gap-1 min-w-[180px]"><span className="label-sm">Topic filter</span><select className={fieldClass} value={topic} onChange={(event) => setTopic(event.target.value)}><option value="ALL">All topics</option>{topics.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="flex flex-col gap-1 min-w-[180px]"><span className="label-sm">Message kind filter</span><select className={fieldClass} value={messageKind} onChange={(event) => setMessageKind(event.target.value)}><option value="ALL">All kinds</option>{MESSAGE_KINDS.map((kind) => <option key={kind}>{kind}</option>)}</select></label>
        <span className="label-sm self-end pb-2">{messages.length} messages · oldest first</span>
      </form>
      <div className="flex flex-col gap-3" aria-label="Messages">
        {messages.map((message) => {
          const receipts = snapshot.acknowledgements.filter((acknowledgement) => acknowledgement.messageId === message.id);
          const eligible = snapshot.participants.filter((participant) => participant.id !== message.authorId &&
            (!message.recipientId || message.recipientId === participant.id) &&
            (!message.context || participant.domains.includes(message.context.domain)) && !receipts.some((receipt) => receipt.participantId === participant.id));
          const acknowledgementId = eligible.find((participant) => participant.id === acknowledgers[message.id])?.id ?? eligible[0]?.id ?? '';
          return <article key={message.id} id={`message-${message.id}`} aria-label={`Message ${message.title}`} className="surface p-3 flex flex-col gap-2 scroll-mt-16">
            <div className="flex flex-wrap justify-between items-center gap-2"><div className="flex flex-wrap gap-2 items-center"><Tag accent={message.kind === 'BLOCKER' || message.kind === 'REQUEST'}>{message.kind}</Tag><span className="mono text-[12px]" style={muted}>{message.topic}</span></div><span className="ts" style={muted}>#{message.sequence} · {message.createdAt}</span></div>
            <h2 className="m-0 text-[16px] font-semibold">{message.title}</h2>
            <p className="m-0 text-[12.5px]" style={muted}>{participantName(message.authorId)} → {message.recipientId ? participantName(message.recipientId) : 'All participants in this scope'}</p>
            <p className="m-0 text-[13px] whitespace-pre-wrap break-words">{message.body}</p>
            <MessageContext message={message} />
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px]" style={muted}><span className="mono">{message.id}</span><a href={`#message-${threadRoot(message, snapshot.messages)}`}>Thread {threadRoot(message, snapshot.messages)}</a>{message.replyTo && <a href={`#message-${message.replyTo}`}>Reply to {message.replyTo}</a>}</div>
            <div className="border-t pt-2 flex flex-col gap-2" style={{ borderColor: 'var(--border-subtle)' }}>
              <p className="m-0 text-[12px]" style={muted}>{receipts.length === 0 ? 'No acknowledgement receipts.' : 'Acknowledgement receipts:'}</p>
              {receipts.length > 0 && <ul className="m-0 pl-4 text-[12px]" style={muted}>{receipts.map((receipt) => <li key={receipt.participantId}>{participantName(receipt.participantId)} · <span className="ts">{receipt.createdAt}</span></li>)}</ul>}
              {snapshot.canWrite && <div className="flex flex-wrap gap-2 items-end">
                <button className="btn btn-sm" type="button" disabled={busy} onClick={() => reply(message)}>Reply</button>
                {eligible.length > 0 && <><label className="flex flex-col gap-1"><span className="label-sm">Acknowledge as</span><select className={fieldClass} aria-label={`Acknowledge ${message.title} as`} value={acknowledgementId} onChange={(event) => setAcknowledgers((previous) => ({ ...previous, [message.id]: event.target.value }))} disabled={busy}>{eligible.map((participant) => <option key={participant.id} value={participant.id}>{participant.name}</option>)}</select></label><button className="btn btn-sm" type="button" disabled={busy} onClick={() => void request({ operation: 'acknowledge', messageId: message.id, participantId: acknowledgementId })}>Acknowledge</button></>}
              </div>}
            </div>
          </article>;
        })}
        {messages.length === 0 && <p className="surface p-3 m-0" style={muted}>No messages match these filters.</p>}
      </div>
      {snapshot.canWrite && <Section title="Post to the board" id="message-composer">
        <form aria-label="Compose message" onSubmit={postMessage} className="surface p-3">
          <fieldset disabled={busy} className="border-0 p-0 m-0 grid grid-cols-1 md:grid-cols-3 gap-3 min-w-0">
            {draft.replyTo && <div className="md:col-span-3 flex flex-wrap items-center gap-3 text-[12.5px]"><span>Replying to <span className="mono">{draft.replyTo}</span>. Topic and release context are inherited.</span><button className="btn btn-sm" type="button" onClick={() => setDraft(blankDraft(draft.authorId))}>Cancel reply</button></div>}
            <label className="flex flex-col gap-1"><span className="label-sm">Author</span><select className={fieldClass} value={draft.authorId} required onChange={(event) => updateDraft({ authorId: event.target.value, recipientId: draft.recipientId === event.target.value ? null : draft.recipientId })}>{snapshot.participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.name}</option>)}</select></label>
            <label className="flex flex-col gap-1"><span className="label-sm">Recipient</span><select className={fieldClass} value={draft.recipientId ?? ''} onChange={(event) => updateDraft({ recipientId: event.target.value || null })}><option value="">All participants in this scope</option>{snapshot.participants.filter((participant) => participant.id !== draft.authorId).map((participant) => <option key={participant.id} value={participant.id}>{participant.name}</option>)}</select></label>
            <label className="flex flex-col gap-1"><span className="label-sm">Message kind</span><select className={fieldClass} value={draft.kind} onChange={(event) => updateDraft({ kind: event.target.value as MessageDraft['kind'] })}>{MESSAGE_KINDS.map((kind) => <option key={kind}>{kind}</option>)}</select></label>
            <label className="flex flex-col gap-1"><span className="label-sm">Topic</span><input className={fieldClass} value={draft.topic} required disabled={Boolean(draft.replyTo)} maxLength={80} onChange={(event) => updateDraft({ topic: event.target.value })} /></label>
            <label className="flex flex-col gap-1 md:col-span-2"><span className="label-sm">Title</span><input className={fieldClass} value={draft.title} required maxLength={180} onChange={(event) => updateDraft({ title: event.target.value })} /></label>
            <label className="flex flex-col gap-1 md:col-span-3"><span className="label-sm">Release context</span><select className={fieldClass} value={draft.context?.releaseId ?? ''} disabled={Boolean(draft.replyTo)} onChange={(event) => updateDraft({ context: snapshot.releaseContexts.find((context) => context.releaseId === event.target.value) ?? null })}><option value="">No release context</option>{snapshot.releaseContexts.map((context) => <option key={context.releaseId} value={context.releaseId}>{context.domain} · {context.releaseId} · {context.buildId} · known {context.knownAt}</option>)}</select></label>
            <label className="flex flex-col gap-1 md:col-span-3"><span className="label-sm">Body</span><textarea id="message-body" className={fieldClass} rows={4} value={draft.body} required maxLength={4000} onChange={(event) => updateDraft({ body: event.target.value })} /></label>
            <div className="md:col-span-3 flex flex-wrap items-center gap-3"><button className="btn btn-primary" type="submit" disabled={!draft.authorId}>Post message</button><span className="text-[12px]" style={muted}>Posting and acknowledgement record coordination only.</span></div>
          </fieldset>
        </form>
      </Section>}
    </>}
  </div>;
}
