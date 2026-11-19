# 7종 재제작

사용자 요청에 따라 금붕어·구피·베타·네온테트라·새우·엔젤피쉬·불가사리를 내장 `image_gen` 도구로 제작했습니다. 이후 **새우는 추가 요청에 따라 회색 이미지 이전의 파란 48×32 두 프레임으로 롤백**했습니다. 나머지 6종만 새 그림을 사용합니다. 프롬프트 전체는 `prompts.json`입니다. `preview-final.png`가 롤백을 반영한 최종 미리보기입니다.

- 실제 편집·게임 원본: `game/public/assets/creatures/` (새 6종은 64×40 두 장씩, 새우는 이전 파란 48×32 두 장)
- `exported/`: 최초 생성 프레임 보관본
- `*-generated.png`: 이미지 생성 결과 보관본, 게임에서 직접 사용하지 않음
- `*-strip.png`: 두 프레임을 붙인 128×40 검토용 보관본
- `preview.png`: 실제 작은 프레임을 최근접 확대해 나란히 배치한 미리보기
- 이전 이미지·연결 정보 백업: `artwork/history/2026-11-20-before-seven-species/`

직접 수정할 때는 프로젝트의 `game/public/assets/creatures/` 파일을 편집하고 다시 빌드하세요. 종 키와 두 프레임의 경로는 `game/domain/creatures.json`에서 관리합니다. 옛 종류를 새 종류로 바꾸는 호환 연결은 `game/domain/creature-aliases.json`에 있으며 계정·닉네임·경험치는 삭제하지 않습니다.

