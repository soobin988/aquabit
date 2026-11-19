const base = '/api/communications';
export async function communicationRequest(path, data) {
  const response = await fetch(base + path, {
    credentials: 'same-origin', cache: 'no-store',
    ...(data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  });
  const value = await response.json().catch(() => ({ error: '메시지 서버를 확인해 주세요.' }));
  if (!response.ok) throw Object.assign(new Error(value.error || '요청을 처리하지 못했어요.'), { status: response.status });
  return value;
}
