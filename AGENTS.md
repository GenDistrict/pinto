# PINTO 작업 안내

## Language / Idioma

PINTO supports English, Spanish, and Korean. Read `INSTALL.md` for English installation, `INSTALL.es.md` for Spanish, or `INSTALL.ko.md` for Korean. Match the user's response language. UI text, native dialogs, errors, and copy/export formatting must use `src/core/i18n.mjs` and the three catalogs under `src/core/locales/`. Preserve user notes, paths, and coordinates when switching languages. Update all catalogs and test the behavior. See `docs/I18N.md`. After installation, report the actual source location, launch method, verified window result, and that the agent can modify this app's local source on request. Never claim a launch you did not verify.

PINTO admite español, inglés y coreano. Para instalar en español, sigue `INSTALL.es.md`. Conserva las notas, rutas y coordenadas del usuario al cambiar de idioma. Todo texto de la aplicación debe usar los tres catálogos de traducción. Verifica los cambios y comunica la ubicación real del código, cómo abrir la aplicación y que el agente puede personalizarla. No afirmes que se abrió si no lo verificaste.

Developer commands: `npm run check`, `npm test`, `npm run build`, `npm run test:e2e`. Source map: `src/renderer/App.tsx` (UI), `Canvas.tsx` (geometry interactions), `src/core/model.ts` (coordinates, validation, instructions), `src/main/storage.ts` (atomic persistence), `src/main/index.ts`/`src/preload/index.ts` (restricted desktop API). Never expose Node.js or unrestricted IPC in the renderer. Preserve source edits and data; use the documented maintenance workflow instead of overwriting installations. Keep image coordinates independent of display zoom/DPI and preserve document versions 1/2/3 and IME input behavior.

PINTO는 Windows·macOS용 로컬 이미지 지시 편집기입니다. 사용자가 소스를 내려받아 AI와 함께 수정하는 제품입니다. 확정된 브랜드는 PINTO이며 `src/renderer/theme.css`와 `assets/brand/`를 기준으로 합니다.

설치 요청은 `INSTALL.md`를 따릅니다. 설치 완료 후 현재 AI 대화에 소스 위치와 실행 방법, 그리고 사용자 요청에 따라 이 앱의 소스를 수정할 수 있다는 사실을 반드시 알려 주세요. 실행 확인에 실패했거나 생략한 경우에는 창을 열었다고 보고하지 않습니다.

## 구조와 변경 위치

- `src/renderer/App.tsx`: 화면 구성, 파일 열기·저장·복사 흐름, 메뉴.
- `src/renderer/Canvas.tsx`: 네모·동그라미·점·선·자유도형, 복수 대상, 확대·이동, 위치별 입력.
- `src/renderer/styles.css`, `theme.css`: 배치, 크기, 색상.
- `src/core/model.ts`: 원본 픽셀 좌표, 문서 검증, AI에 복사되는 지시 형식.
- `src/main/storage.ts`: 참고 이미지와 주석의 원자적 저장·복원.
- `src/main/index.ts`, `src/preload/index.ts`: 제한된 데스크톱 API.
- `scripts/`: 소스 설치, 실행 확인, 업데이트 비교와 복구.

## 명령

작업 폴더는 이 파일이 있는 소스 루트입니다.

```sh
npm run check
npm test
npm run build
npm start
```

실제 Electron 검증은 `npm run test:e2e`, 실행 상태 확인은 `npm run doctor -- --json`입니다. GUI 프로세스는 운영체제의 앱 창 실행 권한이 필요합니다. GUI 검증을 실행하지 못하면 그 제한을 보고하고 통과했다고 쓰지 않습니다.

이미지를 직접 열려면 `npm start -- --image "<이미지 경로>" --workspace "<AI 작업 폴더>"`를 사용합니다. 세션 프로세스와 분리해서 앱을 열고 결과를 받으려면 `node scripts/launch.mjs`에 같은 인자를 전달합니다.

## 유지할 동작

- 좌표는 참고 이미지의 픽셀 기준입니다. 창 배율·Retina·확대율과 섞지 않습니다.
- 참고 이미지를 저장한 뒤 지시를 복사합니다. 화면의 번호와 코멘트는 사용자 입력으로 보관합니다.
- 한글 조합 Enter와 일반 텍스트 편집 단축키를 보존합니다.
- renderer에 Node.js·범용 IPC·임의 파일 쓰기를 노출하지 않습니다.
- 이미지·주석 데이터와 사용자의 개인 코드 변경을 보존합니다. 데이터 형식 변경은 기존 형식 호환성을 처리합니다.
- 자유도형은 원본 픽셀 좌표의 경로로 저장합니다. 문서 버전 1·2를 계속 읽을 수 있어야 하며, 자유도형은 버전 2 이상, 선·타원은 버전 3으로 저장합니다. 이전 전체 지시 데이터는 유지하되 새 작업에 전체 지시 입력란을 다시 추가하지 않습니다.
- 기본 화면은 표시·입력·복사에 집중합니다. 보관 폴더 설정을 AI 연결 기능처럼 표현하지 않습니다. 전달 안내에는 원본을 만든 AI 대화에 붙여넣기와 새 대화에서 원본도 함께 전달하기를 명시합니다.
- 변경에 맞는 검사와 빌드를 수행하고, 실제 실행 결과와 검증하지 못한 환경을 구분합니다.
- 업데이트는 `docs/MAINTENANCE.md`를 따릅니다. 새 버전으로 소스를 강제 덮어쓰지 않습니다.

앱의 문장 톤은 짧고 친근한 한국어입니다. 주요 사용 흐름은 이미지 열기 → 가리키고 입력 → 지시 복사입니다.
