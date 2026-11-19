// 표시·미리보기·PNG 저장에서 항상 같은 버전의 이미지 원본을 사용합니다.
export const gameAssetUrl = file => import.meta.env.BASE_URL + file + '?v=' + __GAME_ASSET_VERSION__;
