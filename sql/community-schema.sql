-- AQUABIT schema (MySQL 8.0+)
-- 모든 시각은 UTC로 저장한다 (서버 연결 timezone = 'Z').

CREATE DATABASE IF NOT EXISTS aquabit
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;
USE aquabit;

-- 기존 테이블과 데이터를 삭제하지 않습니다.

-- 회원
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(20)  NOT NULL UNIQUE,          -- 로그인 아이디 (영문/숫자/_ 4~20)
  password_hash VARCHAR(100) NOT NULL,                 -- bcrypt
  nickname      VARCHAR(12)  NOT NULL,
  pearls        INT UNSIGNED NOT NULL DEFAULT 0,       -- 현재 진주 잔액 (변동은 transactions에 기록)
  is_admin      TINYINT(1)   NOT NULL DEFAULT 0,       -- 관리자 (ADMIN_ENABLED=true일 때만 의미 있음)
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 어항
CREATE TABLE IF NOT EXISTS tanks (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(20)  NOT NULL,
  invite_code CHAR(6)      NOT NULL UNIQUE,
  owner_id    INT UNSIGNED NOT NULL,                   -- 대표
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tanks_owner FOREIGN KEY (owner_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- 어항 참여자 (어항당 최대 10명은 서버에서 트랜잭션으로 검사)
CREATE TABLE IF NOT EXISTS tank_members (
  tank_id   INT UNSIGNED NOT NULL,
  user_id   INT UNSIGNED NOT NULL,
  joined_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tank_id, user_id),
  KEY idx_members_user (user_id),
  CONSTRAINT fk_members_tank FOREIGN KEY (tank_id) REFERENCES tanks(id) ON DELETE CASCADE,
  CONSTRAINT fk_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 물고기 (어항마다 사람당 1마리)
CREATE TABLE IF NOT EXISTS fish (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tank_id      INT UNSIGNED NOT NULL,
  user_id      INT UNSIGNED NOT NULL,
  hue          SMALLINT UNSIGNED NULL,
  name         VARCHAR(12)  NOT NULL,
  species      ENUM('goldfish','tropical','puffer','gold','angel','betta','guppy','neon','shrimp','mackerel','flounder','seabass','tuna','bream','sunfish','ocean1','ocean2','squid','smallfish','sardine','starfish') NOT NULL DEFAULT 'gold',
  color        ENUM('original','orange','coral','lemon','mint','sky','grape') NOT NULL DEFAULT 'orange',
  accessory    ENUM('ribbon','hat','crown') NULL,     -- 착용 중인 장신구 (구매한 것만)
  food_total   INT UNSIGNED NOT NULL DEFAULT 0,       -- 받은 먹이 누적
  stage        TINYINT UNSIGNED NOT NULL DEFAULT 1,   -- 1 아기, 2 꼬마, 3 어른, 4 반짝 (내려가지 않음)
  last_fed_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fish_tank_user (tank_id, user_id),
  CONSTRAINT fk_fish_tank FOREIGN KEY (tank_id) REFERENCES tanks(id) ON DELETE CASCADE,
  CONSTRAINT fk_fish_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 어항별 채팅
CREATE TABLE IF NOT EXISTS messages (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tank_id    INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  body       VARCHAR(300) NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_messages_tank (tank_id, id),
  CONSTRAINT fk_messages_tank FOREIGN KEY (tank_id) REFERENCES tanks(id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 과제
CREATE TABLE IF NOT EXISTS tasks (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tank_id       INT UNSIGNED NOT NULL,
  creator_id    INT UNSIGNED NOT NULL,                -- 대표
  assignee_id   INT UNSIGNED NOT NULL,                -- 담당자 (대표 본인 불가)
  title         VARCHAR(60)  NOT NULL,
  reward        SMALLINT UNSIGNED NOT NULL,           -- 20~100
  due_date      DATE         NOT NULL,
  status        ENUM('todo','submitted','approved','rejected') NOT NULL DEFAULT 'todo',
  proof_url     VARCHAR(300) NULL,
  memo          VARCHAR(500) NULL,
  reject_reason VARCHAR(200) NULL,
  submitted_at  DATETIME NULL,
  reviewed_at   DATETIME NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_tasks_tank (tank_id, status),
  CONSTRAINT fk_tasks_tank     FOREIGN KEY (tank_id)     REFERENCES tanks(id) ON DELETE CASCADE,
  CONSTRAINT fk_tasks_creator  FOREIGN KEY (creator_id)  REFERENCES users(id),
  CONSTRAINT fk_tasks_assignee FOREIGN KEY (assignee_id) REFERENCES users(id),
  CONSTRAINT chk_tasks_reward  CHECK (reward BETWEEN 20 AND 100)
) ENGINE=InnoDB;

-- 진주 지급/사용 내역 (모든 변동 기록)
CREATE TABLE IF NOT EXISTS transactions (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       INT UNSIGNED NOT NULL,
  tank_id       INT UNSIGNED NULL,
  amount        INT          NOT NULL,                -- +지급 / -사용
  balance_after INT UNSIGNED NOT NULL,
  type          ENUM('attendance','streak_bonus','task_reward','buy_food','buy_accessory','seed','admin') NOT NULL,
  ref_id        INT UNSIGNED NULL,                    -- 과제 id 등
  description   VARCHAR(100) NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_tx_user (user_id, id),
  CONSTRAINT fk_tx_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_tx_tank FOREIGN KEY (tank_id) REFERENCES tanks(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 보유 아이템 (먹이 수량, 구매한 장신구)
CREATE TABLE IF NOT EXISTS inventory (
  user_id    INT UNSIGNED NOT NULL,
  item       ENUM('food','ribbon','hat','crown') NOT NULL,
  quantity   INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, item),
  CONSTRAINT fk_inv_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 출석 (하루 1행, 날짜는 한국 시간 기준)
CREATE TABLE IF NOT EXISTS attendance (
  user_id    INT UNSIGNED NOT NULL,
  att_date   DATE         NOT NULL,
  streak     SMALLINT UNSIGNED NOT NULL DEFAULT 1,   -- 연속 출석 일수
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, att_date),
  CONSTRAINT fk_att_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 먹이 주기 기록 (물고기당 하루 5회 제한 검사용)
CREATE TABLE IF NOT EXISTS feedings (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  fish_id    INT UNSIGNED NOT NULL,
  feeder_id  INT UNSIGNED NOT NULL,
  feed_date  DATE         NOT NULL,                   -- 한국 시간 기준 날짜
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_feed_fish_date (fish_id, feed_date),
  CONSTRAINT fk_feed_fish   FOREIGN KEY (fish_id)   REFERENCES fish(id) ON DELETE CASCADE,
  CONSTRAINT fk_feed_feeder FOREIGN KEY (feeder_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 로그인 세션 테이블(sessions)은 express-mysql-session이 자동으로 만든다.
