// Netlify Function: AI 레시피 추천
// 프런트엔드(index.html)가 /.netlify/functions/recommend 로 보내는 요청을 받아
// OpenAI를 호출하고, API 키는 서버(여기)에만 두기 때문에 외부에 노출되지 않습니다.
//
// 필요한 환경변수 (Netlify 사이트 설정 > Environment variables):
//   OPENAI_API_KEY = sk-... (사주/타로 앱에서 쓰던 그 키 그대로 사용 가능)
//
// 모델을 바꾸고 싶으면 아래 MODEL 값만 수정하세요. (gpt-4o-mini = 저렴/빠름)

const MODEL = "gpt-4o-mini";

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST")
    return { statusCode: 405, headers, body: JSON.stringify({ error: "POST only" }) };

  const key = process.env.OPENAI_API_KEY;
  if (!key)
    return { statusCode: 500, headers, body: JSON.stringify({ error: "OPENAI_API_KEY 미설정" }) };

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch (e) {}

  // 상태 점검용 핑
  if (body.ping) return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };

  const ingredients = Array.isArray(body.ingredients) ? body.ingredients : [];
  const expiring = Array.isArray(body.expiring) ? body.expiring : [];
  const mode = body.mode === "selected" ? "selected" : "all";
  if (!ingredients.length)
    return { statusCode: 400, headers, body: JSON.stringify({ error: "재료가 없습니다" }) };

  const sys =
    "너는 한국 가정식 요리를 잘 아는 친절한 요리 선생님이야. " +
    "사용자의 냉장고 재료로 만들 수 있는 현실적인 집밥 레시피 3개를 추천해. " +
    "각 레시피는 요리 초보도 그대로 따라 할 수 있도록 '아주 상세하게' 써. " +
    "유통기한이 임박한 재료를 먼저 소진하는 메뉴를 앞쪽에 배치해. " +
    "반드시 아래 JSON 형식 '그대로'만 출력하고, 마크다운/코드블록/다른 말은 절대 쓰지 마.\n" +
    '{"recipes":[{' +
    '"name":"메뉴명",' +
    '"reason":"이 메뉴를 추천하는 이유 한 줄 (임박 재료를 쓴다면 언급)",' +
    '"time":"예: 약 20분",' +
    '"servings":"예: 2인분",' +
    '"difficulty":"쉬움 / 보통 / 어려움 중 하나",' +
    '"have":["집에 있는 재료와 분량, 예: 두부 1/2모","김치 1컵"],' +
    '"need":["추가로 사야 할 재료와 분량, 예: 대파 1대"],' +
    '"steps":["조리 단계를 5~7개로. 각 단계에 분량·불 세기·시간을 구체적으로 적어. 예: 중불에서 김치를 3~4분 볶는다"],' +
    '"tip":"실패하지 않는 핵심 팁 한 줄"' +
    "}]}";

  const selLine =
    mode === "selected"
      ? "사용자가 직접 고른 재료들이야. 이 재료들을 가능한 한 많이 활용하는 메뉴로 추천해줘.\n"
      : "";

  const user =
    `[냉장고에 있는 재료]\n${ingredients.join(", ")}\n\n` +
    `[유통기한 임박 재료(우선 소진)]\n${expiring.length ? expiring.join(", ") : "없음"}\n\n` +
    selLine +
    `위 재료로 만들 수 있는 한국 가정식 3가지를 JSON으로만, 상세하게 추천해줘. ` +
    `steps는 5~7단계로 분량·불 세기·시간을 넣어 구체적으로. ` +
    `have에는 위 재료 중 실제로 쓰는 것만 분량과 함께 적어줘.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        temperature: 0.7,
        max_tokens: 1800,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: "OpenAI 오류", detail: t.slice(0, 300) }) };
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || "{}";
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { parsed = JSON.parse(raw.replace(/```json|```/g, "").trim()); }

    return { statusCode: 200, headers, body: JSON.stringify({ recipes: parsed.recipes || [] }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(err).slice(0, 300) }) };
  }
};
