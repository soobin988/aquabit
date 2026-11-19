export function feedingBlockReason({ foodCount, fedToday = 0, dailyFeedLimit = 5 } = {}) {
  if (Number(fedToday) >= Number(dailyFeedLimit)) return '배불러요';
  if (Number(foodCount) <= 0) return '먹이가 부족해요';
  return '';
}

// 한 번 기울일 때 여러 알을 요청해도 매 알마다 최신 한도·재고를 확인합니다.
export async function dispenseFeedBatch({ count, getState, feed, onResult, onBlocked }) {
  let dispensed = 0;
  for (let i = 0; i < count; i++) {
    const blocked = feedingBlockReason(getState());
    if (blocked) { onBlocked(blocked); break; }
    try {
      const result = await feed();
      onResult(result); dispensed++;
    } catch (error) { onBlocked(error.message); break; }
    const reason = feedingBlockReason(getState());
    if (reason) { onBlocked(reason); break; }
  }
  return { dispensed, foodCount: getState().foodCount };
}
