/** 사용자에게 보여 줄 메시지를 가진 오류 */
class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** async 라우트의 오류를 next로 넘긴다 */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const bad = (msg, code) => new ApiError(400, msg, code);
const forbidden = (msg = '권한이 없어요.') => new ApiError(403, msg, 'FORBIDDEN');
const notFound = (msg = '찾을 수 없어요.') => new ApiError(404, msg, 'NOT_FOUND');

module.exports = { ApiError, wrap, bad, forbidden, notFound };
