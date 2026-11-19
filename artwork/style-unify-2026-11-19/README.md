# 굵은 도트 스타일 통일

사용자가 보낸 파란 새우를 스타일 기준으로 `image_gen` 내장 이미지 생성 도구에서 종별 두 프레임을 생성했습니다. 생성 프롬프트 전체는 `prompts.json`, 참고 이미지는 `shrimp-reference.png`에 보관했습니다.

- 실제 게임 파일: `../../game/public/assets/fish-종류.png`, `fish-종류-2.png`
- 종류 키: `shrimp`, `gold`, `angel`, `betta`, `guppy`, `neon`
- 프레임마다 **48×32**, 투명 PNG, 4~5가지 불투명 색
- 굵은 남색 외곽선과 2×2 크기의 도트 덩어리로 통일
- 각 두 프레임은 같은 방향이며 지느러미·다리 모양을 바꿔 반복 움직임을 표현
- 새우의 발끝은 게임 모래 높이에 맞춰 y=28에 배치
- 이전 12개 파일: `../history/2026-11-19-before-style-unify/`

직접 수정할 때는 **game/public/assets 안의 PNG**를 편집하세요. 원본을 계속 직접 편집할 예정이라면 `export-chunky-sprites.ps1`을 다시 실행하지 마세요. 이 스크립트는 생성 결과를 작은 PNG로 내보내는 최초 작업용이며, 다시 실행하면 직접 수정한 그림을 교체합니다. 브라우저에 반영하려면 `npm run build` 후 새로고침하세요.

`preview.png`는 실제 프레임을 확대해서 나란히 놓은 검토용 이미지입니다. `*-generated.png`는 생성 결과 보관본이며 게임에서 불러오지 않습니다. `*-strip.png`는 두 프레임을 붙인 96×32 보관본입니다.
