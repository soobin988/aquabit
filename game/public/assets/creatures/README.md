# 새로 만든 7종 도트 이미지

금붕어(`gold`), 구피(`guppy`), 베타(`betta`), 네온테트라(`neon`), 엔젤피쉬(`angel`), 불가사리(`starfish`)는 `종류.png`와 `종류-2.png` 두 장씩 **64×40 투명 PNG**로 새로 제작했습니다. 새우(`shrimp`)는 사용자 요청으로 마지막에 첨부한 파란 새우 그림을 직접 분리한 `shrimp.png`·`shrimp-2.png`(96×64 두 장)로 적용했습니다. 새우 원본 내용은 바꾸지 않았습니다. 선택 가능한 종류는 총 7종입니다.

직접 수정할 때는 **이 폴더**의 같은 파일을 편집하세요. `npm run build` 또는 `npm start`를 실행하면 `public/play/assets/creatures/`로 복사되어 게임에 반영됩니다. `public/play/`는 빌드 결과이므로 이곳에만 파일을 넣으면 다른 컴퓨터로 옮길 때 빠질 수 있습니다.

종류·파일 연결은 `game/domain/creatures.json`에서 관리합니다. 불가사리는 바닥을 천천히 움직이고, 새우는 기존 바닥 이동·점프 동작을 유지합니다. 예전 저장 데이터의 물고기 ID·이름·경험치는 유지하고 옛 종류만 새 종류로 연결합니다.

교체 전 백업은 `artwork/history/2026-11-20-before-seven-species/`, 생성 프롬프트와 확대 미리보기는 `artwork/seven-species-2026-11-20/`에 있습니다. `scripts/export-seven-species.ps1`은 최초 내보내기용이므로 직접 PNG를 수정한 뒤에는 다시 실행하지 않아도 됩니다.


