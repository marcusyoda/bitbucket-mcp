/**
 * Payload normalizers. Bitbucket responses are large and deeply nested;
 * trimming them to the fields callers actually need is the core token saving
 * of this server over raw API calls.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const html = (o: any): string | undefined => o?.links?.html?.href;

export function normalizeUser(u: any) {
  if (!u) return undefined;
  return {
    account_id: u.account_id,
    nickname: u.nickname,
    display_name: u.display_name,
  };
}

export function normalizePr(pr: any) {
  return {
    id: pr.id,
    title: pr.title,
    state: pr.state,
    author: normalizeUser(pr.author),
    source: pr.source?.branch?.name,
    destination: pr.destination?.branch?.name,
    source_commit: pr.source?.commit?.hash,
    reviewers: Array.isArray(pr.reviewers) ? pr.reviewers.map(normalizeUser) : undefined,
    comment_count: pr.comment_count,
    task_count: pr.task_count,
    created_on: pr.created_on,
    updated_on: pr.updated_on,
    description: pr.summary?.raw ?? pr.description,
    link: html(pr),
  };
}

export function normalizeComment(c: any) {
  return {
    id: c.id,
    parent_id: c.parent?.id,
    text: c.content?.raw,
    inline: c.inline ? { path: c.inline.path, from: c.inline.from, to: c.inline.to } : undefined,
    user: normalizeUser(c.user),
    deleted: c.deleted,
    resolved: c.resolution ? true : c.resolved,
    created_on: c.created_on,
    updated_on: c.updated_on,
    link: html(c),
  };
}

export function normalizeBranch(b: any) {
  return {
    name: b.name,
    target_hash: b.target?.hash,
    target_date: b.target?.date,
    target_message: b.target?.message?.trim(),
    link: html(b),
  };
}

export function normalizeRepo(r: any) {
  return {
    full_name: r.full_name,
    name: r.name,
    is_private: r.is_private,
    scm: r.scm,
    mainbranch: r.mainbranch?.name,
    description: r.description,
    updated_on: r.updated_on,
    link: html(r),
  };
}

export function normalizePipeline(p: any) {
  return {
    uuid: p.uuid,
    build_number: p.build_number,
    state: p.state?.name,
    result: p.state?.result?.name,
    stage: p.state?.stage?.name,
    trigger: p.trigger?.name,
    ref_type: p.target?.ref_type,
    ref_name: p.target?.ref_name,
    selector: p.target?.selector,
    creator: normalizeUser(p.creator),
    created_on: p.created_on,
    completed_on: p.completed_on,
    duration_seconds: p.duration_in_seconds,
  };
}

export function normalizePipelineStep(s: any) {
  return {
    uuid: s.uuid,
    name: s.name,
    state: s.state?.name,
    result: s.state?.result?.name,
    started_on: s.started_on,
    completed_on: s.completed_on,
    duration_seconds: s.duration_in_seconds,
  };
}

export function normalizeWebhook(w: any) {
  return {
    uuid: w.uuid,
    url: w.url,
    description: w.description,
    events: w.events,
    active: w.active,
    created_at: w.created_at,
  };
}

/** Secured variable values are write-only in the API; never surface a value. */
export function normalizeVariable(v: any) {
  return {
    uuid: v.uuid,
    key: v.key,
    value: v.secured ? undefined : v.value,
    secured: v.secured,
  };
}

export function normalizeEnvironment(e: any) {
  return {
    uuid: e.uuid,
    name: e.name,
    environment_type: e.environment_type?.name,
    rank: e.rank,
  };
}
