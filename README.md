# AQUABIT 회사 홈페이지

클라우드 컴퓨팅 수업 팀 프로젝트용 **가상 게임 회사 AQUABIT**의 회사 홈페이지(`www.aquabit.lab`)입니다.
회사 화면의 "게임 시작" 버튼은 같은 서버의 `/play/` 어항 화면으로 연결됩니다. 게임은 Vue 3 + PixiJS이며 물고기 종류·색상·장식 꾸미기, 드래그 먹이 주기, 레벨별 장식 해금을 지원합니다.

수업 외 내용인 게임의 현재 저장 방식은 브라우저 localStorage입니다. 내 물고기 한 마리와 시연 물고기 세 마리가 보이고, 꾸미기·경험치·어항 환경을 현재 브라우저에 저장합니다. 팀 생성·초대 코드·회원 계정·DB·채팅은 현재 게임에 연결되지 않았습니다.

> AQUABIT은 실제 회사가 아닙니다.

- Node.js + Express + EJS
- 외부 CDN·폰트·이미지 없이 동작 (학교 내부망용)
- 공지·채용·FAQ·팀 정보는 `data/*.json`만 고치면 바로 반영 (서버 재시작 불필요)

## 페이지

| 주소 | 내용 |
|---|---|
| `/` | Canvas 픽셀 아쿠아리움 배너, 최신 공지 3개, 서비스 특징 |
| `/about` | 비전, 개발 연혁, 팀 역할, 서비스 구성 (ESXi/vCenter, DNS, 메일, 웹) |
| `/game` | Pixel Aquarium 단계별 소개 |
| `/play/` | 실제 플레이와 물고기 꾸미기 |
| `/notices`, `/notices/:id` | 공지 목록(분류 필터, 페이지 나눔), 상세, 이전·다음 글 |
| `/careers` | 가상 채용 공고 |
| `/support` | FAQ, 1:1 문의 폼 |
| 그 외 | 404 페이지 |

## 폴더 구조

```
server.js            앱 시작 (HOST:PORT에서 실행)
app.js               Express 설정 (helmet, 라우터, 404/500)
config/index.js      .env 값 읽기
routes/              pages.js, notices.js, support.js
lib/                 data.js(JSON 읽기), validate.js, mailer.js, inquiryStore.js, rateLimit.js
data/                notices / careers / faq / team / history .json  (+ inquiries.json 자동 생성)
views/               EJS 화면 (partials/에 head, header, footer)
public/              css, js(nav, aquarium, faq), img(SVG 로고·아이콘)
```

## 환경 변수 (.env)

`.env.example`을 복사해서 `.env`를 만듭니다. `.env`는 git에 올라가지 않습니다.

| 이름 | 기본값 | 설명 |
|---|---|---|
| `HOST` | `127.0.0.1` | 앱이 열릴 주소 (Apache 프록시를 쓰면 그대로 두기) |
| `PORT` | `3001` | 앱 포트 |
| `GAME_URL` | `/play/` | "게임 시작" 버튼 주소 |
| `SMTP_HOST` | `mail.aquabit.lab` | 사내 메일 서버(hMailServer) |
| `SMTP_PORT` | `25` | SMTP 포트 |
| `SMTP_USER` / `SMTP_PASS` | (없음) | 메일 서버 로그인 계정. **비밀번호는 .env에만** |
| `MAIL_FROM` | `SMTP_USER` | 보내는 사람 주소 |
| `MAIL_TO` | `support@aquabit.lab` | 문의 메일을 받을 주소 |

메일은 25번 포트에서 암호화(STARTTLS) 없이 `AUTH LOGIN`으로 로그인해 보냅니다. (실습용 메일 서버 설정에 맞춤)

---

## 게임 화면 수정

- 게임 소스는 game/ 폴더, 실제 도트 원본은 game/public/assets/ 폴더입니다.
- 물고기는 48×32, 수초는 32×48, 물과 광선은 128×128 PNG입니다. 랜딩페이지의 파란 물·짙은 외곽선·노란 모래 팔레트를 사용합니다.
- 물고기 원본은 `fish-gold.png`(금붕어), `fish-angel.png`(엔젤피쉬), `fish-betta.png`(베타), `fish-guppy.png`(구피), `fish-neon.png`(네온테트라), `fish-shrimp.png`(새우)입니다. `game/public/assets/`의 파일을 수정하세요. `public/play/`는 빌드할 때 만들어지는 결과물이므로 원본 편집에 사용하지 않습니다.
- 종류마다 PNG가 두 장입니다. 예: `fish-gold.png` + `fish-gold-2.png`, `fish-shrimp.png` + `fish-shrimp-2.png`. 모두 48×32 투명 이미지이며 머리·몸·장식의 기준점은 동일하게 유지하고 꼬리/다리만 바꿉니다. 물고기는 0.26초, 새우는 기어갈 때 0.18초마다 프레임을 바꿉니다. 새우를 잡거나 낙하 중일 때는 다리가 멈추고, 일시정지하면 프레임도 멈춥니다. PNG 저장은 첫 번째 프레임의 정지 이미지입니다.
- 어항 배경은 `game/aquarium/scenery.js`에서 메인 `public/js/aquarium.js`와 같은 4~5px 격자, 줄 단위 수초 흔들림, 광선 이동 방식을 사용합니다. 그림은 PNG에서 읽고, 광선은 물고기 앞쪽에 별도로 표시합니다.
- 배경에는 네온테트라 PNG를 옅은 실루엣으로 표시한 작은 무리가 천천히 지나갑니다. 배경 블러 안쪽에 있고 이름·드래그·먹이 판정에는 참여하지 않으며 일시정지 상태를 따릅니다.
- 2026-11-19 금붕어·베타·구피·네온테트라를 먼저 교체하고, 추가 요청으로 새우·엔젤피쉬도 같은 스타일로 교체했습니다. 이전 8개 파일은 `artwork/history/2026-11-19-before-fish-style/`, 사용자 새우·엔젤피쉬 원본 4개는 `artwork/history/2026-11-19-before-angel-shrimp/`에 보관했습니다. 비교 그림과 생성 기록은 `artwork/style-update-2026-11-19/`에 있습니다.
- 광선은 `game/aquarium/landing-light.mjs`에서 메인페이지의 광선 반복문을 그대로 사용합니다. 기본 수중 기포는 `bubble-dot.png`(1×1)로 바닥에서 수면까지 반복 상승합니다. 물고기가 뱉는 기포는 기존 `bubble.png`를 사용합니다.
- 게임 광선은 메인과 같은 움직임을 유지하며, 너비 9칸(기존 6칸), 길이는 모래 윗면까지(기존 80%)로 표시합니다.
- 새우는 수면까지 드래그할 수 있습니다. 놓으면 천천히 가라앉아 발끝이 모래에 닿는 위치에서 좌우로 기어다니고, 바닥 먹이만 따라갑니다.
- 새우는 떨어지는 먹이에 반응해 작게 점프한 뒤 착지합니다. 먹이는 모래 위에 남고 새우는 바닥 알갱이만 주워 먹습니다. 이전처럼 내 생물만 먹이에 반응합니다.
- 테스트용 먹이는 처음 10개 지급됩니다. 밥통에서 실제 떨어뜨린 수만큼 먼저 차감·저장한 뒤 생성하므로 새로고침해도 남은 수량이 유지되며 0개일 때는 더 떨어지지 않습니다. 수조 오른쪽 아래에서 잔량을 볼 수 있습니다.
- 수초 설정은 그림 카드로 선택합니다. 오른쪽 위 정보 아이콘에서 사용 가이드를 열고, 왼쪽 도구 모음에서 일시정지할 수 있습니다. 버튼 아이콘도 `icon-*.png`(16×16 투명 PNG)로 따로 저장되어 있습니다.
- PNG를 직접 편집한 뒤 `npm run build`하면 바뀐 이미지 버전이 적용됩니다. `node scripts/export-game-art.cjs`는 랜딩 팔레트로 원본을 다시 생성하므로 직접 수정한 PNG를 덮어씁니다.
- 장식 원본은 accessory-bow.png(리본), accessory-flower.png(꽃), accessory-crown.png(왕관), effect-sparkle.png(반짝이)입니다. 모두 48×32 투명 PNG이며 그림을 수정할 때 투명 여백과 크기를 유지합니다.
- 꾸미기 창의 물고기 PNG 저장은 꾸민 물고기를, 장식 PNG 저장은 물고기를 제외한 장식·효과를 저장합니다.
- 원본 PNG는 48×32를 유지하며, 어항에서는 PC 기준 가로 180px·모바일 기준 120px로 확대 표시합니다(작은 어항은 화면에 맞춰 제한). 장식과 후광도 같은 비율로 움직입니다.
- 먹이는 현재 사용자의 물고기만 따라가서 먹고 경험치를 얻습니다. 다른 물고기의 경험치는 바뀌지 않습니다. 로컬 저장소와 화면 명령에서도 타인 물고기의 먹이 보상을 거부합니다.
- 로고 이미지는 `public/img/logo.png`(232×36, 투명 배경), `logo-pixel.png`(58×9 도트 원본), `logo-light.png`(232×36, 흰 글자)입니다. 편집 가능한 SVG 원본은 그대로 유지합니다. SVG를 수정하면 `node scripts/export-logo.cjs`로 PNG를 다시 저장할 수 있습니다.
- npm start와 npm run dev는 게임을 빌드하고 회사 서버를 실행합니다. 게임 코드를 고치면 npm run build 후 새로고침하세요.
- public/play/는 빌드 결과라 Git에서 제외합니다. 소스와 package-lock.json으로 다시 만들 수 있습니다.
- 게임 빌드에는 Vite가 필요합니다. 실습 서버에서 npm ci --omit=dev로 설치한다면 npm ci가 되는 개발 PC에서 먼저 npm run build를 실행하고 public/play/를 함께 옮긴 뒤 node server.js로 실행하세요. 서버에서 직접 빌드하려면 npm ci로 개발 도구까지 설치합니다.

## 1) 내 PC에서 실행하기

Node.js 22.12 이상이 필요합니다. (`node -v`로 확인)

```bash
git clone <저장소 주소> aquabit-homepage
cd aquabit-homepage
npm install
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
# .env를 열어 SMTP_PASS 등을 채움 (메일 서버가 없어도 실행은 됨)
npm start
```

브라우저에서 <http://127.0.0.1:3001> 을 엽니다.

- `npm run dev`: 파일을 고치면 서버가 자동으로 다시 켜집니다.
- 메일 서버에 연결할 수 없으면 문의는 `data/inquiries.json`에 저장되고 화면에 "접수됨(메일 전달 실패)"이 표시됩니다.

---

## 2) Rocky Linux 10 web VM에서 실행하기

```bash
# 패키지 설치
sudo dnf install -y git nodejs npm
node -v        # v22.12 이상인지 확인

# 앱 전용 사용자와 폴더
sudo useradd --system --home-dir /opt/aquabit-homepage --shell /sbin/nologin aquabit
sudo git clone <저장소 주소> /opt/aquabit-homepage
cd /opt/aquabit-homepage
sudo npm ci
sudo npm run build

# 환경 변수
sudo cp .env.example .env
sudo vi .env                      # SMTP_USER, SMTP_PASS 등 입력
sudo chmod 600 .env

# 권한: 앱 사용자가 data 폴더(문의 저장)에 쓸 수 있어야 함
sudo chown -R aquabit:aquabit /opt/aquabit-homepage

# 시험 실행 (Ctrl+C로 종료)
sudo -u aquabit node server.js
curl -I http://127.0.0.1:3001     # 다른 터미널에서 200 OK 확인
```

나중에 코드를 업데이트할 때:

```bash
cd /opt/aquabit-homepage
sudo -u aquabit git pull
sudo -u aquabit npm ci
sudo -u aquabit npm run build
sudo systemctl restart aquabit-homepage
```

> `git pull`을 `aquabit` 사용자로 하려면 저장소가 공개(public)이거나 접근 권한이 있어야 합니다.
> 안 되면 `sudo git pull` 후 `sudo chown -R aquabit:aquabit /opt/aquabit-homepage`를 다시 실행하세요.

---

## 3) systemd 서비스로 등록 (재부팅 후 자동 실행)

`/etc/systemd/system/aquabit-homepage.service` 파일을 만듭니다.

```ini
[Unit]
Description=AQUABIT company homepage (Node.js)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=aquabit
Group=aquabit
WorkingDirectory=/opt/aquabit-homepage
ExecStart=/usr/bin/node server.js
Environment=NODE_ENV=production
Restart=on-failure
RestartSec=3

# 보안 설정: data 폴더만 쓰기 허용
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/opt/aquabit-homepage/data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now aquabit-homepage
sudo systemctl status aquabit-homepage
journalctl -u aquabit-homepage -f        # 로그 보기 (메일 전달 실패 기록도 여기에 남음)
```

`which node` 결과가 `/usr/bin/node`가 아니면 `ExecStart` 경로를 맞게 바꿔 주세요.

---

## 4) Apache VirtualHost로 www.aquabit.lab 프록시

같은 web VM의 Apache가 `www.aquabit.lab` 요청을 `127.0.0.1:3001`로 넘깁니다.
(`game.aquabit.lab`용 VirtualHost는 게임 서비스 쪽 설정을 그대로 둡니다.)

```bash
sudo dnf install -y httpd          # 이미 설치되어 있으면 생략
```

`/etc/httpd/conf.d/www.aquabit.lab.conf`:

```apache
<VirtualHost *:80>
    ServerName www.aquabit.lab
    ServerAlias aquabit.lab

    ProxyRequests Off
    ProxyPreserveHost On
    ProxyPass        / http://127.0.0.1:3001/
    ProxyPassReverse / http://127.0.0.1:3001/
    RequestHeader set X-Forwarded-Proto "http"

    ErrorLog  /var/log/httpd/www.aquabit.lab-error.log
    CustomLog /var/log/httpd/www.aquabit.lab-access.log combined
</VirtualHost>
```

```bash
# SELinux: Apache(httpd)가 다른 포트(3001)로 접속하도록 허용 (-P: 재부팅 후에도 유지)
sudo setsebool -P httpd_can_network_connect 1
getsebool httpd_can_network_connect          # → on

# 설정 검사 후 적용
sudo apachectl configtest                    # Syntax OK
sudo systemctl enable --now httpd
sudo systemctl reload httpd

# 방화벽에서 HTTP 열기
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --reload
```

확인:

```bash
curl -I -H "Host: www.aquabit.lab" http://127.0.0.1/
```

- DNS(dns1·dns2)에 `www` 레코드가 web VM IP를 가리켜야 다른 PC에서 접속됩니다.
- SELinux 설정을 빠뜨리면 브라우저에 **503 Service Unavailable**이 뜨고, `/var/log/audit/audit.log`에 `httpd` 거부 기록이 남습니다.
- 앱은 `127.0.0.1`에서 온 프록시 요청에 한해 `X-Forwarded-For`를 믿으므로, 문의 횟수 제한(10분에 5건)이 실제 접속자 IP 기준으로 동작합니다.

---

## 문의 폼 동작

1. 서버에서 입력 검사: 이름, 이메일 형식, 분류, 제목, 내용 10자 이상, 개인정보 동의
2. 통과하면 `data/inquiries.json`에 저장 → nodemailer로 `MAIL_TO`에 메일 발송
3. 메일 발송이 실패해도 저장은 유지하고 "접수됨(메일 전달 실패)"으로 안내 (`mailStatus: "failed"` 기록)
4. 중복 접수 방지: 접수 후 결과 화면으로 이동(POST → 303 → GET)하고, 폼마다 한 번만 쓰는 토큰을 사용
5. 스팸 방지: 보이지 않는 honeypot 칸, 같은 IP는 10분에 5건까지

접수된 문의 보기: `cat data/inquiries.json`

## 보안

- helmet 보안 헤더 적용. HTTP 사이트라서 `upgrade-insecure-requests`와 HSTS는 끔
- 인라인 스크립트 없이 CSP를 엄격하게 적용 (`script-src 'self'`)
- 화면 출력은 EJS `<%= %>` 자동 이스케이프
- 비밀번호는 `.env`에만 두고, `.env`와 `data/inquiries.json`은 `.gitignore`로 제외

## 내용 수정

| 바꿀 것 | 파일 |
|---|---|
| 공지 | `data/notices.json` (`category`: `notice` / `update` / `maintenance` / `event`) |
| 채용 공고 | `data/careers.json` |
| FAQ | `data/faq.json` |
| 팀 역할 | `data/team.json` (`icon`: server, globe, code, mail / `color`: coral, yellow, mint, violet) |
| 연혁 | `data/history.json` |

JSON 문법이 틀리면 그 목록이 비어 보이고 서버 로그에 `읽기 실패`가 남습니다.

## 우리 어항의 채팅·사내 메일 (수업 외 내용)

GitHub 팀 어항을 합친 새 게임은 [팀 어항 통합 안내](docs/community-integration.md)를 참고하세요. 홈페이지의 게임 시작은 `/community/login.html`로 연결되며, DB가 없는 노트북에서는 **체험하기**로 확인합니다. 아래 설명의 기존 체험 어항은 `/play/`에 남아 있습니다.

왼쪽 편지 아이콘을 누르면 **채팅 / 메일** 탭이 열립니다. 채팅은 같은 웹 서버에 접속한 사람끼리 공유하며 3초 간격으로 새 내용을 확인합니다. 현재 게임의 닉네임을 표시하며, 회사 메일 로그인과는 별도로 동작합니다.

메일 탭에서는 hMailServer에 등록된 개인 메일 계정으로 로그인합니다. 받은 메일 확인·답장·새 메일 보내기와 웹에서 보낸 메일 확인을 지원합니다. 메일 계정 비밀번호는 서버 메모리에만 보관하며 파일이나 브라우저 저장소에 저장하지 않습니다. 로그아웃하면 지워지고, 세션은 마지막 사용 후 1시간에 만료됩니다. 첨부파일은 이름만 표시하며 내려받기는 지원하지 않습니다. 받은 메일은 서버에서 삭제하지 않습니다.

현재 실습 서버에 맞춘 `.env` 설정:

```dotenv
WEBMAIL_HOST=192.168.163.162
WEBMAIL_SERVER_NAME=mail.aquabit.lab
WEBMAIL_DOMAIN=aquabit.lab
WEBMAIL_SMTP_PORT=25
WEBMAIL_POP_PORT=110
WEBMAIL_SMTP_SECURE=false
WEBMAIL_POP_SECURE=false
WEBMAIL_STARTTLS=false
```

`mail.aquabit.lab`은 서버 이름이고, 메일 주소의 도메인은 `aquabit.lab`입니다. 설정을 변경한 뒤 Node.js 서버를 다시 실행하세요. 노트북 개발 중에는 실제 메일 서버 연결 테스트를 하지 않고, 나중에 해당 실습 네트워크에서 송수신을 확인합니다. 메일 탭을 열기만 하면 메일 서버에 접속하지 않습니다. 메일 계정 로그인부터 접속합니다.

채팅은 `data/aquarium-chat.json`, 웹에서 보낸 메일 기록은 `data/aquarium-sent-mail.json`에 저장합니다. 두 파일과 `.env`는 Git 업로드에서 제외합니다. 웹에서 보낸 메일 목록에는 Thunderbird에서 보낸 메일이 포함되지 않습니다.

로컬 검사 명령:

```bash
node --test tests/game-simulation.test.mjs tests/communications.test.cjs
```

통신 테스트는 테스트용 임시 저장소와 노트북 내부의 가짜 SMTP·POP3 서버를 사용합니다. 실제 사내 메일 서버에는 접속하지 않습니다.

## GitHub에 올리기

```bash
git init
git add .
git status            # .env, node_modules, data/inquiries.json이 목록에 없는지 확인
git commit -m "AQUABIT 회사 홈페이지"
git branch -M main
git remote add origin https://github.com/<계정>/aquabit-homepage.git
git push -u origin main
```
