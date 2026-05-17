/**
 * Minimal i18n for wirechar. Two languages: 'en', 'ko'.
 * - t(key) → translated string for current language
 * - pick({en, ko}) → choose one from an inline object
 * - setLang(lang) → update current language, persist to localStorage,
 *                   broadcast 'wirechar-lang-change' event so UI can re-render.
 */

const STORAGE_KEY = 'wirechar_lang';
const FALLBACK = 'en';

const STRINGS = {
  // ── Window / title bar ──
  app_title:               { en: 'WIRECHAR', ko: 'WIRECHAR' },
  mode_off:                { en: 'Attack Detection: Off',         ko: '공격 감지: 꺼짐' },
  mode_detect:             { en: 'Attack Detection: On',          ko: '공격 감지: 켜짐' },
  mode_block:              { en: 'Attack Detection + Auto-Block', ko: '공격 감지 + 자동 차단' },
  mode_tooltip:            { en: 'Defense / attack-detection mode', ko: '방어 / 공격 감지 모드' },
  defense_clear:           { en: '✓ clear',                       ko: '✓ 안전' },
  defense_auto_start:      { en: 'Defense active — auto-started capture on',
                             ko: '방어 활성 — 캡처 자동 시작:' },
  defense_no_iface:        { en: 'Defense requires a network interface — select one first',
                             ko: '방어모드를 위해 네트워크 인터페이스를 먼저 선택하세요' },
  defense_no_tshark:       { en: 'Defense requires Wireshark/tshark — install it first',
                             ko: '방어모드는 Wireshark/tshark가 필요합니다 — 먼저 설치하세요' },
  defense_resumed:         { en: 'Defense restored from last session',
                             ko: '이전 세션의 방어모드를 복원했습니다' },
  defense_attacking:       { en: 'attacking',                     ko: '공격 중' },
  defense_blocked:         { en: 'blocked',                       ko: '차단됨' },
  lang_tooltip:            { en: 'Language',                      ko: '언어' },
  theme_toggle_tip:        { en: 'Toggle dark / light',           ko: '다크 / 라이트 전환' },
  font_tooltip:            { en: 'Font family',                   ko: '글꼴' },
  font_size_tooltip:       { en: 'Font size (px)',                ko: '글꼴 크기 (px)' },

  // ── Toolbar ──
  interface_label:         { en: 'Interface:',                    ko: '인터페이스:' },
  capture_start:           { en: '▶ Capture',                     ko: '▶ 캡처 시작' },
  capture_stop:            { en: '■ Stop',                        ko: '■ 중지' },
  filter_placeholder:      { en: 'Display filter (e.g. tcp.port==443 && http.host contains "google")',
                             ko: '디스플레이 필터 (예: tcp.port==443 && http.host contains "google")' },
  filter_tooltip:          { en: 'Wireshark display-filter syntax. Press Enter to apply.',
                             ko: '와이어샤크 디스플레이 필터 문법. Enter로 적용.' },

  // Status messages
  status_ready_admin:      { en: '✓ Running as Administrator — ready to capture.',
                             ko: '✓ 관리자 권한 — 캡처 준비 완료.' },
  status_no_admin:         { en: '⚠ Not running as Administrator — capture will fail. Relaunch as Admin.',
                             ko: '⚠ 관리자 권한 없음 — 캡처 불가. 관리자 권한으로 재실행하세요.' },
  status_no_tshark:        { en: 'tshark not found — install Wireshark to C:\\Program Files\\Wireshark\\',
                             ko: 'tshark 미설치 — C:\\Program Files\\Wireshark\\에 Wireshark 설치 필요' },
  status_no_devices:       { en: 'No network interfaces found. Run as Administrator.',
                             ko: '네트워크 인터페이스 없음. 관리자 권한으로 실행하세요.' },
  status_select_iface:     { en: 'Select a network interface first.',
                             ko: '먼저 네트워크 인터페이스를 선택하세요.' },
  status_capture_stopped:  { en: 'Capture stopped.',              ko: '캡처 중지됨.' },
  status_capturing_on:     { en: 'Capturing on',                  ko: '캡처 중:' },
  status_filter_applying:  { en: 'Applying filter:',              ko: '필터 적용 중:' },
  status_filter_none:      { en: '(none)',                        ko: '(없음)' },
  status_error_prefix:     { en: 'Error:',                        ko: '오류:' },
  status_restarting:       { en: 'Capture engine restarting…',    ko: '캡처 엔진 재시작 중…' },
  status_restarted_code:   { en: 'Capture auto-restarted (last exit code',
                             ko: '캡처 자동 재시작 (마지막 종료 코드' },

  // ── Left panel ──
  panel_live_traffic:      { en: 'Live Traffic',                  ko: '실시간 트래픽' },
  list_search_placeholder: { en: 'Search   e.g. 192.168.0.*   10.0.0.0/24   *.google.com   port:443   tag:web-search',
                             ko: '검색   예: 192.168.0.*   10.0.0.0/24   *.google.com   port:443   tag:web-search' },
  list_search_clear:       { en: 'Clear search',                  ko: '검색 지우기' },
  list_load_history:       { en: 'Load from disk',                ko: '디스크에서 불러오기' },
  list_load_history_tip:   { en: 'Load older packets from saved log file',
                             ko: '저장된 로그에서 이전 패킷 불러오기' },
  list_loading:            { en: 'Loading…',                      ko: '불러오는 중…' },
  list_loaded:             { en: 'Loaded',                        ko: '불러옴' },
  list_log_disabled:       { en: 'No log file (start capture)',   ko: '로그 없음 (캡처 시작)' },
  list_clear_logs:         { en: 'Clear logs',                    ko: '로그 삭제' },
  list_clear_logs_tip:     { en: 'Delete saved capture log files from disk',
                             ko: '저장된 캡처 로그 파일을 디스크에서 삭제' },

  // ── Detail panel ──
  detail_title:            { en: 'Packet Detail',                 ko: '패킷 상세' },
  detail_close_tip:        { en: 'Clear selection',               ko: '선택 해제' },
  detail_placeholder:      { en: 'Click a packet to inspect ▸ (press <b>D</b> for first packet)',
                             ko: '패킷을 클릭해서 상세 보기 ▸ (<b>D</b>키로 첫 패킷)' },
  hex_header:              { en: 'Raw Bytes (hex dump)',          ko: '원본 바이트 (헥스 덤프)' },
  hex_placeholder:         { en: '— select a packet to view binary —',
                             ko: '— 패킷을 선택하면 바이너리가 표시됩니다 —' },
  hex_loading:             { en: '— loading hex dump… —',         ko: '— 헥스 덤프 로딩 중… —' },
  hex_unavailable:         { en: '[no hex available — frame not in pcap]',
                             ko: '[헥스 데이터 없음 — 프레임이 pcap에 없음]' },
  hex_signature_prefix:    { en: 'Raw Bytes — ',                  ko: '원본 바이트 — ' },

  // Detail layer titles
  layer_frame:             { en: 'Frame',                         ko: '프레임' },
  layer_ethernet:          { en: 'Ethernet II',                   ko: '이더넷 II' },
  layer_ipv4:              { en: 'Internet Protocol v4',          ko: '인터넷 프로토콜 v4' },
  layer_tcp:               { en: 'Transmission Control Protocol', ko: '전송 제어 프로토콜 (TCP)' },
  layer_udp:               { en: 'User Datagram Protocol',        ko: '사용자 데이터그램 프로토콜 (UDP)' },
  layer_dns:               { en: 'Domain Name System (DNS)',      ko: '도메인 네임 시스템 (DNS)' },
  layer_http:              { en: 'Hypertext Transfer Protocol',   ko: '하이퍼텍스트 전송 프로토콜 (HTTP)' },
  layer_tls:               { en: 'Transport Layer Security (TLS)', ko: '전송 계층 보안 (TLS)' },

  // Detail field names
  f_number:                { en: 'Number',                        ko: '번호' },
  f_time:                  { en: 'Time',                          ko: '시간' },
  f_length:                { en: 'Length',                        ko: '길이' },
  f_direction:             { en: 'Direction',                     ko: '방향' },
  f_protocol:              { en: 'Protocol',                      ko: '프로토콜' },
  f_info:                  { en: 'Info',                          ko: '정보' },
  f_src_mac:               { en: 'Source MAC',                    ko: '출발지 MAC' },
  f_dst_mac:               { en: 'Destination MAC',               ko: '목적지 MAC' },
  f_source:                { en: 'Source',                        ko: '출발지' },
  f_destination:           { en: 'Destination',                   ko: '목적지' },
  f_ttl:                   { en: 'TTL',                           ko: 'TTL' },
  f_src_port:              { en: 'Source Port',                   ko: '출발지 포트' },
  f_dst_port:              { en: 'Destination Port',              ko: '목적지 포트' },
  f_seq:                   { en: 'Sequence Number',               ko: '시퀀스 번호' },
  f_ack:                   { en: 'Acknowledgment Number',         ko: '확인 번호 (ACK)' },
  f_flags:                 { en: 'Flags',                         ko: '플래그' },
  f_window:                { en: 'Window Size',                   ko: '윈도우 크기' },
  f_query_name:            { en: 'Query Name',                    ko: '질의 이름' },
  f_query_type:            { en: 'Query Type',                    ko: '질의 유형' },
  f_answer_a:              { en: 'Answer A (IPv4)',               ko: '응답 A (IPv4)' },
  f_answer_aaaa:           { en: 'Answer AAAA (IPv6)',            ko: '응답 AAAA (IPv6)' },
  f_answer_cname:          { en: 'Answer CNAME',                  ko: '응답 CNAME' },
  f_host:                  { en: 'Host',                          ko: '호스트' },
  f_method:                { en: 'Method',                        ko: '메서드' },
  f_uri:                   { en: 'Request URI',                   ko: '요청 URI' },
  f_status:                { en: 'Response Code',                 ko: '응답 코드' },
  f_phrase:                { en: 'Response Phrase',               ko: '응답 문구' },
  f_user_agent:            { en: 'User-Agent',                    ko: '사용자 에이전트' },
  f_sni:                   { en: 'Server Name (SNI)',             ko: '서버 이름 (SNI)' },
  f_tls_version:           { en: 'Version',                       ko: '버전' },
  f_handshake_type:        { en: 'Handshake Type',                ko: '핸드셰이크 유형' },
  dir_in:                  { en: 'Incoming (↓)',                  ko: '수신 (↓)' },
  dir_out:                 { en: 'Outgoing (↑)',                  ko: '송신 (↑)' },

  // ── Context menu ──
  ctx_copy_row:            { en: 'Copy row',                      ko: '행 복사' },
  ctx_copy_host:           { en: 'Copy host / IP',                ko: '호스트 / IP 복사' },
  ctx_copy_src:            { en: 'Copy source IP',                ko: '출발지 IP 복사' },
  ctx_copy_dst:            { en: 'Copy destination IP',           ko: '목적지 IP 복사' },
  ctx_copy_json:           { en: 'Copy as JSON',                  ko: 'JSON으로 복사' },
  ctx_block_src:           { en: 'Block source IP (firewall)',    ko: '출발지 IP 차단 (방화벽)' },
  ctx_clear:               { en: 'Clear list',                    ko: '목록 비우기' },
  ctx_tag_brand:           { en: 'Tag as brand…',                 ko: '브랜드 지정…' },
  ctx_untag_brand:         { en: 'Clear brand tag',               ko: '브랜드 지정 해제' },

  // Brand picker modal
  brand_picker_title:      { en: 'Tag IP as brand',               ko: 'IP에 브랜드 지정' },
  brand_picker_search:     { en: 'Type to filter brands…',        ko: '브랜드 검색…' },
  brand_picker_target:     { en: 'Target IP',                     ko: '대상 IP' },
  brand_picker_empty:      { en: 'No brands match',               ko: '일치하는 브랜드 없음' },
  brand_picker_tagged:     { en: 'Tagged',                        ko: '지정됨:' },
  brand_picker_untagged:   { en: 'Brand tag cleared',              ko: '브랜드 지정이 해제됨' },

  // ── Tabs ──
  tab_live:                { en: 'Live Traffic',                  ko: '실시간 트래픽' },
  tab_devices:             { en: 'Devices',                       ko: '기기 목록' },
  tab_stats:               { en: 'Statistics',                    ko: '통계' },
  tab_attacks:             { en: 'Attack Log',                    ko: '공격 로그' },

  // ── Devices tab ──
  dev_col_status:          { en: '',                              ko: '' },
  dev_col_mac:             { en: 'MAC',                           ko: 'MAC' },
  dev_col_ip:              { en: 'IP',                            ko: 'IP' },
  dev_col_vendor:          { en: 'Vendor',                        ko: '제조사' },
  dev_col_hostname:        { en: 'Hostname',                      ko: '호스트명' },
  dev_col_first:           { en: 'First seen',                    ko: '첫 발견' },
  dev_col_last:            { en: 'Last seen',                     ko: '최근 활동' },
  dev_col_packets:         { en: 'Packets',                       ko: '패킷' },
  dev_empty:               { en: 'No devices discovered yet — start capture',
                             ko: '아직 발견된 기기 없음 — 캡처를 시작하세요' },
  dev_local:               { en: 'this device',                   ko: '내 기기' },
  dev_router:              { en: 'router',                        ko: '라우터' },
  dev_unknown:             { en: 'unknown',                       ko: '미식별' },

  // ── Stats tab ──
  stats_top_talkers:       { en: 'Top Talkers',                   ko: '주요 통신 호스트' },
  stats_protocols:         { en: 'Protocols',                     ko: '프로토콜 분포' },
  stats_traffic_chart:     { en: 'Traffic Over Time',             ko: '시간별 트래픽' },
  stats_classifiers:       { en: 'Activity Types',                ko: '활동 유형' },
  stats_summary:           { en: 'Session Summary',               ko: '세션 요약' },
  stats_no_data:           { en: 'No data yet',                   ko: '데이터 없음' },
  stats_session_pkts:      { en: 'Total packets',                 ko: '총 패킷 수' },
  stats_session_bytes:     { en: 'Total bytes',                   ko: '총 바이트' },
  stats_session_duration:  { en: 'Duration',                      ko: '시간' },
  stats_session_hosts:     { en: 'Unique hosts',                  ko: '고유 호스트' },
  stats_log_policy:        { en: 'Disk log policy',                ko: '디스크 로그 정책' },
  stats_log_written:       { en: 'Written to disk',                ko: '디스크 기록' },
  stats_log_skipped:       { en: 'Skipped (policy)',               ko: '건너뜀 (정책)' },
  stats_log_policy_off:     { en: 'Off',                           ko: '꺼짐' },
  stats_log_policy_attacks: { en: 'Attacks only',                  ko: '공격만' },
  stats_log_policy_smart:   { en: 'Smart',                         ko: '스마트' },
  stats_log_policy_all:     { en: 'All packets',                   ko: '전체' },
  stats_log_dir:            { en: 'Logs folder',                   ko: '로그 폴더' },
  stats_log_open:           { en: 'Open',                          ko: '열기' },

  stats_diagnostics:        { en: 'Detector diagnostics',          ko: '디텍터 진단' },
  stats_trusted_ips:        { en: 'Trusted IPs (auto)',            ko: '신뢰된 IP (자동)' },
  stats_tracking_ips:       { en: 'IPs being watched',             ko: '감시 중 IP' },
  stats_active_suspicions:  { en: 'Active suspicions',             ko: '활성 의심 항목' },
  stats_user_whitelist:     { en: 'User whitelist',                ko: '사용자 화이트리스트' },
  stats_iphost_cache:       { en: 'IP↔host cache entries',         ko: 'IP↔호스트 캐시' },
  stats_app_version:        { en: 'wirechar version',              ko: 'wirechar 버전' },

  // ── Stats ──
  stat_particles:          { en: 'particles:',                    ko: '파티클:' },

  // ── Attack log ──
  log_view_btn:            { en: 'View',                          ko: '보기' },
  log_title:               { en: 'Attack Log',                    ko: '공격 로그' },
  log_close:               { en: 'Close',                         ko: '닫기' },
  log_empty:               { en: 'No attacks detected yet.',      ko: '감지된 공격 없음' },
  log_clear_history:       { en: 'Clear ended',                   ko: '종료된 항목 비우기' },
  log_unblock_all:         { en: 'Unblock all',                   ko: '모두 차단 해제' },
  log_filter_all:          { en: 'All',                           ko: '전체' },
  log_filter_active:       { en: 'Active',                        ko: '진행 중' },
  log_filter_confirmed:    { en: 'Confirmed',                     ko: '확정됨' },
  log_filter_blocked:      { en: 'Blocked',                       ko: '차단됨' },
  log_filter_ended:        { en: 'Ended',                         ko: '종료됨' },

  log_col_ip:              { en: 'Source IP',                     ko: '출발지 IP' },
  log_col_type:            { en: 'Type',                          ko: '유형' },
  log_col_rate:            { en: 'Rate',                          ko: '속도' },
  log_col_severity:        { en: 'Severity',                      ko: '강도' },
  log_col_first:           { en: 'First seen',                    ko: '첫 감지' },
  log_col_duration:        { en: 'Duration',                      ko: '지속 시간' },
  log_col_status:          { en: 'Status',                        ko: '상태' },
  log_col_action:          { en: 'Action',                        ko: '동작' },

  log_status_active:       { en: 'Active',                        ko: '진행 중' },
  log_status_confirmed:    { en: 'Confirmed',                     ko: '확정' },
  log_status_blocked:      { en: 'Blocked',                       ko: '차단됨' },
  log_status_ended:        { en: 'Ended',                         ko: '종료' },

  log_action_block:        { en: 'Block',                         ko: '차단' },
  log_action_unblock:      { en: 'Unblock',                       ko: '차단 해제' },
  log_action_copy:         { en: 'Copy IP',                       ko: 'IP 복사' },
  log_action_whitelist:    { en: 'Whitelist',                     ko: '예외' },
  log_status_whitelisted:  { en: 'Whitelisted',                   ko: '예외 등록' },
  log_whitelisted_toast:   { en: 'Whitelisted',                   ko: '예외 등록됨:' },
  log_whitelisted_hint:    { en: "won't trigger again",            ko: '다시 잡히지 않음' },

  // Attack types
  atk_flood:               { en: 'Packet Flood',                  ko: '패킷 플러드' },
  atk_syn_flood:           { en: 'SYN Flood',                     ko: 'SYN 플러드' },
  atk_port_scan:           { en: 'Port Scan',                     ko: '포트 스캔' },
  atk_icmp_flood:          { en: 'ICMP Flood',                    ko: 'ICMP 플러드' },

  // ── Classifier tags (used by classify.js + analyzeBytes) ──
  // Hosts
  cls_web_search:          { en: 'Web search',                    ko: '웹 검색' },
  cls_web_search_google:   { en: 'Web search / Google',           ko: '웹 검색 / Google' },
  cls_youtube:             { en: 'YouTube video',                 ko: '유튜브 동영상' },
  cls_netflix:             { en: 'Netflix',                       ko: '넷플릭스' },
  cls_twitch:              { en: 'Twitch stream',                 ko: '트위치 방송' },
  cls_video:               { en: 'Video streaming',               ko: '동영상 스트리밍' },
  cls_audio:               { en: 'Music streaming',               ko: '음악 스트리밍' },
  cls_discord:             { en: 'Discord',                       ko: '디스코드' },
  cls_telegram:            { en: 'Telegram',                      ko: '텔레그램' },
  cls_whatsapp:            { en: 'WhatsApp',                      ko: '왓츠앱' },
  cls_signal:              { en: 'Signal',                        ko: '시그널' },
  cls_slack:               { en: 'Slack',                         ko: '슬랙' },
  cls_kakao:               { en: 'KakaoTalk',                     ko: '카카오톡' },
  cls_naver:               { en: 'Naver',                         ko: '네이버' },
  cls_daum:                { en: 'Daum / Kakao',                  ko: '다음 / 카카오' },
  cls_github:              { en: 'GitHub',                        ko: 'GitHub' },
  cls_code_repo:           { en: 'Code repository',               ko: '코드 저장소' },
  cls_cdn:                 { en: 'CDN (static assets)',           ko: 'CDN (정적 자원)' },
  cls_microsoft:           { en: 'Microsoft',                     ko: '마이크로소프트' },
  cls_update:              { en: 'Windows Update',                ko: '윈도우 업데이트' },
  cls_apple:               { en: 'Apple services',                ko: '애플 서비스' },
  cls_steam:               { en: 'Steam / games',                 ko: '스팀 / 게임' },
  cls_epic:                { en: 'Epic Games',                    ko: '에픽게임즈' },
  cls_battle_net:          { en: 'Battle.net',                    ko: '배틀넷' },
  cls_riot:                { en: 'Riot / LoL',                    ko: '라이엇 / LoL' },
  cls_hoyo:                { en: 'miHoYo / HoYoverse',            ko: '미호요 / 호요버스' },
  cls_nexon:               { en: 'Nexon games',                   ko: '넥슨 게임' },
  cls_zoom:                { en: 'Zoom meeting',                  ko: 'Zoom 화상회의' },
  cls_meeting:             { en: 'Video meeting',                 ko: '화상회의' },
  cls_cloud:               { en: 'Cloud storage',                 ko: '클라우드 저장소' },
  cls_onedrive:            { en: 'OneDrive',                      ko: 'OneDrive' },
  cls_gdrive:              { en: 'Google Drive',                  ko: 'Google Drive' },
  cls_ai:                  { en: 'AI chatbot',                    ko: 'AI 챗봇' },
  cls_shopping:            { en: 'Shopping',                      ko: '쇼핑' },
  cls_payment:             { en: 'Payment / transfer',            ko: '결제 / 송금' },
  cls_tracker:             { en: 'Ad / analytics tracker',        ko: '광고 / 분석 추적' },
  cls_twitter:             { en: 'Twitter / X',                   ko: '트위터 / X' },
  cls_facebook:            { en: 'Facebook',                      ko: '페이스북' },
  cls_instagram:           { en: 'Instagram',                     ko: '인스타그램' },
  cls_reddit:              { en: 'Reddit',                        ko: '레딧' },

  // Ports / protocols
  cls_ftp:                 { en: 'FTP file transfer',             ko: 'FTP 파일 전송' },
  cls_ssh:                 { en: 'SSH remote shell',              ko: 'SSH 원격 접속' },
  cls_telnet:              { en: 'Telnet remote',                 ko: 'Telnet 원격' },
  cls_smtp:                { en: 'Mail send (SMTP)',              ko: '메일 전송 (SMTP)' },
  cls_smtps:               { en: 'Mail send (SMTPS)',             ko: '메일 전송 (SMTPS)' },
  cls_smtp_587:            { en: 'Mail send (SMTP)',              ko: '메일 전송 (SMTP)' },
  cls_dns:                 { en: 'DNS lookup',                    ko: 'DNS 도메인 조회' },
  cls_dhcp:                { en: 'DHCP IP lease',                 ko: 'DHCP IP 할당' },
  cls_http:                { en: 'Web (HTTP)',                    ko: '웹 페이지 (HTTP)' },
  cls_https:               { en: 'Secure web (HTTPS)',            ko: '보안 웹 (HTTPS)' },
  cls_pop3:                { en: 'Mail receive (POP3)',           ko: '메일 수신 (POP3)' },
  cls_pop3s:               { en: 'Mail receive (POP3S)',          ko: '메일 수신 (POP3S)' },
  cls_imap:                { en: 'Mail receive (IMAP)',           ko: '메일 수신 (IMAP)' },
  cls_imaps:               { en: 'Mail receive (IMAPS)',          ko: '메일 수신 (IMAPS)' },
  cls_ntp:                 { en: 'Time sync (NTP)',               ko: '시간 동기화 (NTP)' },
  cls_netbios:             { en: 'Windows name (NetBIOS)',        ko: '윈도우 이름 (NetBIOS)' },
  cls_netbios_dgm:         { en: 'Windows datagram (NetBIOS)',    ko: '윈도우 알림 (NetBIOS)' },
  cls_smb:                 { en: 'Windows file share (SMB)',      ko: '윈도우 파일 공유' },
  cls_snmp:                { en: 'SNMP device management',        ko: 'SNMP 장비 관리' },
  cls_ldap:                { en: 'LDAP directory',                ko: 'LDAP 디렉터리' },
  cls_ldaps:               { en: 'LDAPS directory',               ko: 'LDAPS 디렉터리' },
  cls_syslog:              { en: 'Syslog logging',                ko: 'Syslog 로그' },
  cls_vpn_openvpn:         { en: 'VPN (OpenVPN)',                 ko: 'VPN (OpenVPN)' },
  cls_vpn_wg:              { en: 'VPN (WireGuard)',               ko: 'VPN (WireGuard)' },
  cls_db_mssql:            { en: 'SQL Server DB',                 ko: 'SQL Server DB' },
  cls_db_oracle:           { en: 'Oracle DB',                     ko: 'Oracle DB' },
  cls_db_mysql:            { en: 'MySQL DB',                      ko: 'MySQL DB' },
  cls_db_postgres:         { en: 'PostgreSQL DB',                 ko: 'PostgreSQL DB' },
  cls_db_redis:            { en: 'Redis DB',                      ko: 'Redis DB' },
  cls_db_mongo:            { en: 'MongoDB',                       ko: 'MongoDB' },
  cls_ssdp:                { en: 'UPnP device discovery',         ko: 'UPnP 장비 검색' },
  cls_rtmp:                { en: 'Live stream (RTMP)',            ko: '라이브 스트림 (RTMP)' },
  cls_nfs:                 { en: 'NFS file share',                ko: 'NFS 파일 공유' },
  cls_rdp:                 { en: 'RDP remote desktop',            ko: 'RDP 원격 데스크톱' },
  cls_voip_sip:            { en: 'VoIP call (SIP)',               ko: 'VoIP 통화 (SIP)' },
  cls_voip_sips:           { en: 'VoIP call (SIPS)',              ko: 'VoIP 통화 (SIPS)' },
  cls_xmpp:                { en: 'XMPP messaging',                ko: 'XMPP 메시지' },
  cls_mdns:                { en: 'mDNS local discovery',          ko: 'mDNS 로컬 검색' },
  cls_vnc:                 { en: 'VNC remote',                    ko: 'VNC 원격' },
  cls_http_alt:            { en: 'Web (HTTP :8080)',              ko: '웹 (HTTP :8080)' },
  cls_https_alt:           { en: 'Secure web (HTTPS :8443)',      ko: '보안 웹 (HTTPS :8443)' },

  // HTTP / TLS / flow
  cls_web_post:            { en: 'Sending data (POST)',           ko: '데이터 전송 (POST)' },
  cls_web_get:             { en: 'Loading web page (GET)',        ko: '웹 페이지 요청 (GET)' },
  cls_web_ok:              { en: 'Web response',                  ko: '웹 응답' },
  cls_web_err:             { en: 'Web error',                     ko: '웹 오류' },
  cls_server_err:          { en: 'Server error',                  ko: '서버 오류' },
  cls_tls_hello:           { en: 'HTTPS handshake start',         ko: 'HTTPS 연결 시작' },
  cls_tls_data:            { en: 'Encrypted traffic',             ko: '암호화 통신' },
  cls_dns_query:           { en: 'DNS query:',                    ko: 'DNS 조회:' },
  cls_connect:             { en: 'Connection attempt',            ko: '연결 시도' },
  cls_close:               { en: 'Connection closing',            ko: '연결 종료' },
  cls_reset:               { en: 'Connection reset',              ko: '연결 끊김' },
  cls_ping:                { en: 'Ping / ICMP',                   ko: 'Ping / ICMP' },
  cls_download:            { en: 'Downloading',                   ko: '다운로드 중' },
  cls_upload:              { en: 'Uploading',                     ko: '업로드 중' },
  cls_udp_packet:          { en: 'UDP packet',                    ko: 'UDP 패킷' },
  cls_data:                { en: 'Data transfer',                 ko: '데이터 전송' },

  // ── Byte-pattern analyzer (analyzeBytes) ──
  byte_http_get:           { en: 'HTTP GET request (loading page/file)',  ko: 'HTTP GET 요청 (페이지/파일 받기)' },
  byte_http_post:          { en: 'HTTP POST request (sending data)',      ko: 'HTTP POST 요청 (데이터 보내기)' },
  byte_http_put:           { en: 'HTTP PUT request',                      ko: 'HTTP PUT 요청' },
  byte_http_delete:        { en: 'HTTP DELETE request',                   ko: 'HTTP DELETE 요청' },
  byte_http_head:          { en: 'HTTP HEAD request (headers only)',      ko: 'HTTP HEAD 요청 (헤더만)' },
  byte_http_options:       { en: 'HTTP OPTIONS (preflight)',              ko: 'HTTP OPTIONS (사전 요청)' },
  byte_http_response:      { en: 'HTTP response',                         ko: 'HTTP 응답' },
  byte_ssh_banner:         { en: 'SSH protocol banner (server identification)', ko: 'SSH 배너 (서버 식별)' },
  byte_ftp_user:           { en: 'FTP login — username (plaintext!)',     ko: 'FTP 로그인 — 사용자명 (평문!)' },
  byte_ftp_pass:           { en: 'FTP login — password (plaintext!)',     ko: 'FTP 로그인 — 비밀번호 (평문!)' },
  byte_smtp_helo:          { en: 'SMTP server greeting',                  ko: 'SMTP 메일 서버 인사' },
  byte_smtp_from:          { en: 'SMTP mail FROM',                        ko: 'SMTP 메일 발신자' },
  byte_smtp_to:            { en: 'SMTP mail TO',                          ko: 'SMTP 메일 수신자' },
  byte_starttls:           { en: 'STARTTLS — upgrade to encrypted',       ko: 'STARTTLS 암호화 전환' },
  byte_imap:               { en: 'IMAP command',                          ko: 'IMAP 명령' },
  byte_tls_hs:             { en: 'TLS handshake',                         ko: 'TLS 핸드셰이크' },
  byte_tls_hs_client:      { en: 'TLS handshake — Client Hello',          ko: 'TLS 핸드셰이크 — Client Hello' },
  byte_tls_hs_server:      { en: 'TLS handshake — Server Hello',          ko: 'TLS 핸드셰이크 — Server Hello' },
  byte_tls_hs_cert:        { en: 'TLS handshake — Certificate',           ko: 'TLS 핸드셰이크 — 인증서' },
  byte_tls_hs_keyex:       { en: 'TLS handshake — Key Exchange',          ko: 'TLS 핸드셰이크 — 키 교환' },
  byte_tls_hs_finished:    { en: 'TLS handshake — Finished',              ko: 'TLS 핸드셰이크 — 완료' },
  byte_tls_app:            { en: 'TLS application data (encrypted)',      ko: 'TLS 암호화된 응용 데이터' },
  byte_tls_alert:          { en: 'TLS alert (warning/error)',             ko: 'TLS 경고/오류' },
  byte_tls_cipher:         { en: 'TLS change cipher spec',                ko: 'TLS 암호 사양 변경' },
  byte_file_png:           { en: 'PNG image transfer',                    ko: 'PNG 이미지 전송' },
  byte_file_jpeg:          { en: 'JPEG image transfer',                   ko: 'JPEG 이미지 전송' },
  byte_file_gif:           { en: 'GIF image transfer',                    ko: 'GIF 이미지 전송' },
  byte_file_zip:           { en: 'ZIP / office document download',        ko: 'ZIP / 사무문서 다운로드' },
  byte_file_pdf:           { en: 'PDF download',                          ko: 'PDF 다운로드' },
  byte_file_exe:           { en: 'Windows executable (EXE/DLL) transfer!',ko: 'Windows 실행파일 (EXE/DLL) 전송!' },
  byte_file_elf:           { en: 'Linux executable (ELF)',                ko: 'Linux 실행파일 (ELF)' },
  byte_file_gzip:          { en: 'GZIP compressed data',                  ko: 'GZIP 압축 데이터' },
  byte_file_bzip2:         { en: 'BZIP2 compressed',                      ko: 'BZIP2 압축' },
  byte_file_mp4:           { en: 'MP4 video stream',                      ko: 'MP4 동영상 데이터' },
  byte_rtp:                { en: 'RTP real-time voice/video',             ko: 'RTP 실시간 음성/영상' },
  byte_quic_short:         { en: 'QUIC (HTTP/3 encrypted)',               ko: 'QUIC (HTTP/3 암호화)' },
  byte_quic_long:          { en: 'QUIC initial handshake',                ko: 'QUIC 초기 핸드셰이크' },
};

let currentLang = (() => {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
})();

const listeners = new Set();

// If localStorage already had a language (upgrading user), tell the main process
// so it skips the first-launch picker.
if (currentLang && typeof window !== 'undefined' && window.wirechar?.hintLang) {
  try { window.wirechar.hintLang(currentLang); } catch {}
}

// Listen for main-process language change (from first-launch picker)
if (typeof window !== 'undefined' && window.wirechar?.onLangChanged) {
  window.wirechar.onLangChanged((lang) => {
    if (lang === currentLang) return;
    currentLang = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch {}
    applyStaticTranslations();
    for (const cb of listeners) { try { cb(lang); } catch {} }
  });
}

// Fall back if nothing set yet
if (!currentLang) currentLang = FALLBACK;

export function getLang() { return currentLang; }

export function setLang(lang) {
  if (lang !== 'en' && lang !== 'ko') return;
  if (lang === currentLang) return;
  currentLang = lang;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch {}
  // Sync to main process so native dialogs (Wireshark missing etc.) use it next time
  if (typeof window !== 'undefined' && window.wirechar?.setLangToMain) {
    try { window.wirechar.setLangToMain(lang); } catch {}
  }
  applyStaticTranslations();
  for (const cb of listeners) {
    try { cb(lang); } catch {}
  }
}

export function onLangChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }

// Lookup a single key
export function t(key) {
  const entry = STRINGS[key];
  if (!entry) return key;
  return entry[currentLang] || entry[FALLBACK] || key;
}

// Translate an inline {en, ko} object (used by classify.js)
export function pick(obj) {
  if (!obj) return '';
  if (typeof obj === 'string') return obj;
  return obj[currentLang] || obj[FALLBACK] || '';
}

// Apply translations to elements declared in HTML via data-i18n-* attributes.
export function applyStaticTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
}
