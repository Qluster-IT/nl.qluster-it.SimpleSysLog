새로운 향상된 Simple (Sys) Log.

이 앱은 플로우에 로깅 및/또는 알림을 추가할 수 있게 해줍니다. 선택적으로 로그는 메시지 외에 앱/그룹, 심각도 및 시설을 가질 수 있습니다.

여러 Syslog 클라이언트에 연결하여 특정 메시지를 보내거나, 기본 메시지(특정 심각도를 가진)를 모두 보낼 수 있습니다.

마지막으로, 다른 Syslog 클라이언트가 연결할 수 있는 Syslog 서버 장치를 만들어 Simple (Sys) Log에 작성되도록 할 수 있습니다.

이 새로운 버전은 로그를 메모리가 아닌 파일에 저장하여 이전보다 훨씬 큰 로그를 저장할 수 있습니다.

완전히 새로운 설정 페이지가 있으며, Syslog와 같은 인터페이스로 다음을 수행할 수 있습니다:
* 모바일이나 다른 가로 화면 장치에서 더 나은 보기를 위해 화면을 회전합니다.
* 특정 메시지, 날짜 등을 검색하고 필터링합니다.
* 열을 숨기거나 이동합니다.
* 필터나 열을 기본값으로 저장합니다.
* 모바일 앱, 개발 도구 또는 플로우 내에서 포맷된 Excel, Csv 또는 JSON으로 전체 로그를 다운로드합니다.

API

다음 API 엔드포인트를 사용할 수 있습니다:
- 로그 데이터 가져오기:
  GET /api/app/nl.nielsdeklerk.log/
- 로그 데이터 추가:
  PUT /api/app/nl.nielsdeklerk.log/addlog/
  Content-Type: application/json
  {"log": "Test 1,2,3", "group": "TEST", "severity": 6, "facility": 5, "timestamp": new Date() }
  * log만 필수이며, 나머지는 선택사항입니다.
- 로그 지우기:
  GET /api/app/nl.nielsdeklerk.log/clearlog
  
* 이 앱은 여전히 독립형 앱으로 기능하지만, 모든 기능 및 새로운 인터페이스를 활성화하려면 Better Logic Library App이 설치되어야 합니다.