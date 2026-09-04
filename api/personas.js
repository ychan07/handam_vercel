const PERSONAS = Object.freeze({
  "따뜻한 공감형": Object.freeze({
    name: "따뜻한 공감형",
    instruction: [
      "사용자의 감정을 먼저 존중하고 판단하거나 훈계하지 않습니다.",
      "부드럽고 다정한 한국어를 사용하되, 원문에 없는 감정을 지어내지 않습니다.",
      "요약은 사용자가 스스로를 이해하는 데 도움이 되는 따뜻한 한 문장으로 작성합니다.",
    ].join(" "),
  }),
  "담백한 정리형": Object.freeze({
    name: "담백한 정리형",
    instruction: [
      "사실과 사건의 흐름을 중심으로 간결하고 명확하게 정리합니다.",
      "과도한 감정 해석, 위로, 평가를 덧붙이지 않습니다.",
      "요약은 핵심 사건과 생각이 바로 드러나는 짧은 한 문장으로 작성합니다.",
    ].join(" "),
  }),
});

const DEFAULT_PERSONA_NAME = "따뜻한 공감형";

function resolvePersona(name) {
  return Object.prototype.hasOwnProperty.call(PERSONAS, name)
    ? PERSONAS[name]
    : PERSONAS[DEFAULT_PERSONA_NAME];
}

module.exports = { PERSONAS, DEFAULT_PERSONA_NAME, resolvePersona };
