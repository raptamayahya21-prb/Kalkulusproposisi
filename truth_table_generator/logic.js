const displays = {
  "truth-expression": "",
  "eval-expression": "",
  "neg-expression": "",
};

const cardsGrid = document.querySelector(".cards-grid");
const heroPrimary = document.querySelector(".hero-actions .primary");
const heroGhost = document.querySelector(".hero-actions .ghost");

heroPrimary?.addEventListener("click", () => {
  cardsGrid?.scrollIntoView({ behavior: "smooth", block: "start" });
});

const showGuideToast = () => {
  const existing = document.querySelector(".guide-toast");
  if (existing) {
    existing.remove();
  }
  const toast = document.createElement("div");
  toast.className = "guide-toast";
  toast.innerHTML = `
    <p>Gunakan keypad untuk membangun proposisi, lalu klik aksi di tiap kartu.</p>
    <p>Variabel p/q/r/s bisa dikombinasikan dengan operator ¬, ∧, ∨, →, ↔.</p>
    <p>Setiap fitur berjalan murni di browser dengan parser custom.</p>
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add("visible"), 10);
  setTimeout(() => {
    toast.classList.remove("visible");
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
  }, 6000);
};

heroGhost?.addEventListener("click", showGuideToast);

const updateDisplay = (id) => {
  const el = document.getElementById(id);
  const content = displays[id] || "⋯";
  el.textContent = content;
};

const appendSymbol = (target, symbol) => {
  displays[target] = (displays[target] || "") + symbol;
  updateDisplay(target);
};

const undoSymbol = (target) => {
  displays[target] = (displays[target] || "").slice(0, -1);
  updateDisplay(target);
};

const clearExpression = (target) => {
  displays[target] = "";
  updateDisplay(target);
};

document.querySelectorAll(".keypad").forEach((pad) => {
  const target = pad.dataset.target;
  pad.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => appendSymbol(target, btn.dataset.value));
  });
});

document.querySelectorAll(".composer").forEach((composer) => {
  const target = composer.dataset.target;
  composer.querySelectorAll(".controls button").forEach((btn) => {
    const action = btn.dataset.action;
    if (action === "undo") {
      btn.addEventListener("click", () => undoSymbol(target));
    } else if (action === "clear") {
      btn.addEventListener("click", () => clearExpression(target));
    }
  });
});

const showMessage = (containerId, message) => {
  const container = document.getElementById(containerId);
  container.innerHTML = `<p class="placeholder">${message}</p>`;
};

const tokenize = (input) => {
  const clean = input.replace(/\s+/g, "");
  const tokens = [];
  let i = 0;
  while (i < clean.length) {
    const char = clean[i];
    const next = clean.slice(i, i + 2);
    const nextThree = clean.slice(i, i + 3);
    if ("pqrsPQRS".includes(char)) {
      tokens.push({ type: "VAR", value: char.toLowerCase() });
      i += 1;
    } else if (char === "(") {
      tokens.push({ type: "LPAREN" });
      i += 1;
    } else if (char === ")") {
      tokens.push({ type: "RPAREN" });
      i += 1;
    } else if (char === "¬" || char === "!") {
      tokens.push({ type: "NOT", value: "¬" });
      i += 1;
    } else if (char === "∧" || char === "&") {
      tokens.push({ type: "AND", value: "∧" });
      i += 1;
    } else if (char === "∨" || char === "v" || char === "V") {
      tokens.push({ type: "OR", value: "∨" });
      i += 1;
    } else if (char === "→" || next === "->") {
      tokens.push({ type: "IMP", value: "→" });
      i += next === "->" ? 2 : 1;
    } else if (char === "↔" || nextThree === "<->") {
      tokens.push({ type: "BICOND", value: "↔" });
      i += nextThree === "<->" ? 3 : 1;
    } else {
      throw new Error(`Simbol tidak dikenali di posisi ${i + 1}`);
    }
  }
  return tokens;
};

const parse = (tokens) => {
  let idx = 0;

  const peek = () => tokens[idx];
  const consume = () => tokens[idx++];

  const parseExpression = () => parseEquivalence();

  const parseEquivalence = () => {
    let node = parseImplication();
    while (peek() && peek().type === "BICOND") {
      consume();
      node = {
        type: "binary",
        op: "↔",
        left: node,
        right: parseImplication(),
      };
    }
    return node;
  };

  const parseImplication = () => {
    let node = parseDisjunction();
    while (peek() && peek().type === "IMP") {
      consume();
      node = {
        type: "binary",
        op: "→",
        left: node,
        right: parseDisjunction(),
      };
    }
    return node;
  };

  const parseDisjunction = () => {
    let node = parseConjunction();
    while (peek() && peek().type === "OR") {
      consume();
      node = {
        type: "binary",
        op: "∨",
        left: node,
        right: parseConjunction(),
      };
    }
    return node;
  };

  const parseConjunction = () => {
    let node = parseUnary();
    while (peek() && peek().type === "AND") {
      consume();
      node = {
        type: "binary",
        op: "∧",
        left: node,
        right: parseUnary(),
      };
    }
    return node;
  };

  const parseUnary = () => {
    if (peek() && peek().type === "NOT") {
      consume();
      return { type: "not", operand: parseUnary() };
    }
    return parsePrimary();
  };

  const parsePrimary = () => {
    const token = peek();
    if (!token) throw new Error("Proposisi tidak lengkap.");
    if (token.type === "VAR") {
      consume();
      return { type: "var", name: token.value };
    }
    if (token.type === "LPAREN") {
      consume();
      const expr = parseExpression();
      if (!peek() || peek().type !== "RPAREN") {
        throw new Error("Kurung belum ditutup.");
      }
      consume();
      return { type: "group", inner: expr };
    }
    throw new Error("Token tidak valid ditemukan.");
  };

  const ast = parseExpression();
  if (idx !== tokens.length) {
    throw new Error("Proposisi mengandung bagian yang tidak terbaca.");
  }
  return ast;
};

const evaluateTree = (node, context) => {
  const steps = [];
  const walk = (current) => {
    if (current.type === "var") {
      const value = !!context[current.name];
      return value;
    }
    if (current.type === "group") {
      return walk(current.inner);
    }
    if (current.type === "not") {
      const operandValue = walk(current.operand);
      const result = !operandValue;
      steps.push({
        op: "¬",
        detail: `¬(${formatNode(current.operand)}) => ${result}`,
        value: result,
      });
      return result;
    }
    if (current.type === "binary") {
      const left = walk(current.left);
      const right = walk(current.right);
      let result = false;
      switch (current.op) {
        case "∧":
          result = left && right;
          break;
        case "∨":
          result = left || right;
          break;
        case "→":
          result = !left || right;
          break;
        case "↔":
          result = left === right;
          break;
      }
      steps.push({
        op: current.op,
        detail: `(${left} ${current.op} ${right}) => ${result}`,
        value: result,
      });
      return result;
    }
    throw new Error("Node tidak dikenali.");
  };

  const value = walk(node);
  return { value, steps };
};

const getVariables = (node, set = new Set()) => {
  if (!node) return set;
  if (node.type === "var") {
    set.add(node.name);
  } else if (node.type === "not") {
    getVariables(node.operand, set);
  } else if (node.type === "group") {
    getVariables(node.inner, set);
  } else if (node.type === "binary") {
    getVariables(node.left, set);
    getVariables(node.right, set);
  }
  return set;
};

const formatNode = (node) => {
  if (!node) return "";
  if (node.type === "var") return node.name;
  if (node.type === "group") return `(${formatNode(node.inner)})`;
  if (node.type === "not") {
    const operand = node.operand.type === "var" ? formatNode(node.operand) : `(${formatNode(node.operand)})`;
    return `¬${operand}`;
  }
  if (node.type === "binary") {
    return `(${formatNode(node.left)} ${node.op} ${formatNode(node.right)})`;
  }
  return "";
};

const truthOutput = document.getElementById("truth-output");
const generateBtn = document.getElementById("generate-table");

const generateTruthTable = () => {
  const expr = displays["truth-expression"];
  if (!expr) {
    showMessage("truth-output", "Masukkan proposisi terlebih dahulu ya :)");
    return;
  }
  try {
    const tokens = tokenize(expr);
    const ast = parse(tokens);
    const variables = Array.from(getVariables(ast)).sort();
    if (variables.length === 0) {
      showMessage("truth-output", "Proposisi butuh minimal satu variabel.");
      return;
    }
    const table = document.createElement("table");
    table.className = "truth-table";
    const headerRow = document.createElement("tr");
    variables.forEach((v) => {
      const th = document.createElement("th");
      th.textContent = v;
      headerRow.appendChild(th);
    });
    const resultHead = document.createElement("th");
    resultHead.textContent = formatNode(ast);
    headerRow.appendChild(resultHead);
    const thead = document.createElement("thead");
    thead.appendChild(headerRow);

    const tbody = document.createElement("tbody");
    const combos = 2 ** variables.length;
    let finalEval = false;
    for (let idx = 0; idx < combos; idx++) {
      const assignment = {};
      variables.forEach((v, position) => {
        assignment[v] = !!(idx & (1 << (variables.length - position - 1)));
      });
      const { value } = evaluateTree(ast, assignment);
      const row = document.createElement("tr");
      if (value) row.classList.add("true-row");
      variables.forEach((v) => {
        const td = document.createElement("td");
        td.textContent = assignment[v] ? "T" : "F";
        row.appendChild(td);
      });
      const resultCell = document.createElement("td");
      resultCell.textContent = value ? "T" : "F";
      row.appendChild(resultCell);
      tbody.appendChild(row);
      if (idx === combos - 1) finalEval = value;
    }
    truthOutput.innerHTML = "";
    table.appendChild(thead);
    table.appendChild(tbody);
    truthOutput.appendChild(table);
    const finalBox = document.createElement("div");
    finalBox.className = "final-eval";
    finalBox.textContent = `Evaluasi baris terakhir: ${finalEval ? "TRUE" : "FALSE"}`;
    truthOutput.appendChild(finalBox);
  } catch (error) {
    showMessage("truth-output", `Ups, ${error.message}`);
  }
};

generateBtn.addEventListener("click", generateTruthTable);

// Variable toggles
const variableStates = { p: true, q: true, r: true, s: true };
document.querySelectorAll(".variable-toggle").forEach((tog) => {
  const name = tog.dataset.var;
  tog.querySelectorAll(".toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const value = btn.dataset.value === "true";
      variableStates[name] = value;
      tog.querySelectorAll(".toggle").forEach((b) => b.classList.add("inactive"));
      btn.classList.remove("inactive");
    });
  });
});

const evaluateOutput = document.getElementById("evaluate-output");
document.getElementById("evaluate-prop").addEventListener("click", () => {
  const expr = displays["eval-expression"];
  if (!expr) {
    showMessage("evaluate-output", "Susun proposisi dulu yuk ✨");
    return;
  }
  try {
    const tokens = tokenize(expr);
    const ast = parse(tokens);
    const { value, steps } = evaluateTree(ast, variableStates);
    const wrapper = document.createElement("div");
    wrapper.className = "evaluate-result";
    const status = document.createElement("div");
    status.className = `status ${value ? "true" : "false"}`;
    status.textContent = `Hasil akhir: ${value ? "TRUE" : "FALSE"}`;
    wrapper.appendChild(status);
    const stepList = document.createElement("div");
    stepList.className = "step-list";
    steps.forEach((step, idx) => {
      const item = document.createElement("div");
      item.className = "step";
      item.dataset.op = step.op;
      item.textContent = `Langkah ${idx + 1}: ${step.detail}`;
      stepList.appendChild(item);
    });
    wrapper.appendChild(stepList);
    evaluateOutput.innerHTML = "";
    evaluateOutput.appendChild(wrapper);
    animateStepHighlight(stepList);
  } catch (error) {
    showMessage("evaluate-output", `Parser lagi bingung: ${error.message}`);
  }
});

const animateStepHighlight = (container) => {
  const steps = container.querySelectorAll(".step");
  steps.forEach((step) => step.classList.remove("active"));
  steps.forEach((step, idx) => {
    setTimeout(() => {
      steps.forEach((s) => s.classList.remove("active"));
      step.classList.add("active");
    }, idx * 700);
  });
  if (steps.length) {
    setTimeout(() => steps[steps.length - 1].classList.add("active"), steps.length * 700 + 10);
  }
};

const negateNode = (node) => ({ type: "not", operand: node });

const simplifyNegation = (node) => {
  if (node.type !== "not") return node;
  const target = node.operand;
  if (target.type === "not") {
    return simplifyNode(target.operand);
  }
  if (target.type === "binary" && (target.op === "∧" || target.op === "∨")) {
    return {
      type: "binary",
      op: target.op === "∧" ? "∨" : "∧",
      left: simplifyNode({ type: "not", operand: target.left }),
      right: simplifyNode({ type: "not", operand: target.right }),
    };
  }
  return { ...node, operand: simplifyNode(target) };
};

const simplifyNode = (node) => {
  if (!node) return node;
  if (node.type === "not") {
    return simplifyNegation(node);
  }
  if (node.type === "binary") {
    return {
      ...node,
      left: simplifyNode(node.left),
      right: simplifyNode(node.right),
    };
  }
  if (node.type === "group") {
    return { type: "group", inner: simplifyNode(node.inner) };
  }
  return node;
};

const toNaturalLanguage = (node) => {
  if (!node) return "";
  if (node.type === "var") return node.name;
  if (node.type === "not") return `tidak benar bahwa ${toNaturalLanguage(node.operand)}`;
  if (node.type === "group") return toNaturalLanguage(node.inner);
  if (node.type === "binary") {
    const left = toNaturalLanguage(node.left);
    const right = toNaturalLanguage(node.right);
    switch (node.op) {
      case "∧":
        return `${left} dan ${right}`;
      case "∨":
        return `${left} atau ${right}`;
      case "→":
        return `${left} menyiratkan ${right}`;
      case "↔":
        return `${left} ekuivalen dengan ${right}`;
      default:
        return `${left} ${node.op} ${right}`;
    }
  }
  return "";
};

document.getElementById("generate-negation").addEventListener("click", () => {
  const expr = displays["neg-expression"];
  if (!expr) {
    showMessage("negation-output", "Masukkan proposisi agar bisa dinegasikan.");
    return;
  }
  try {
    const tokens = tokenize(expr);
    const ast = parse(tokens);
    const formal = negateNode(ast);
    const simplified = simplifyNode(negateNode(ast));
    const block = document.createElement("div");
    block.className = "negation-block";
    const lines = [
      { label: "Negasi formal", value: formatNode(formal) },
      { label: "Versi disederhanakan", value: formatNode(simplified) },
      { label: "Bahasa natural", value: `Tidak benar bahwa ${toNaturalLanguage(ast)}` },
    ];
    lines.forEach((line, idx) => {
      const wrapper = document.createElement("div");
      wrapper.className = "neg-line";
      wrapper.dataset.type = idx === 2 ? "natural" : "formal";
      if (idx === 0) wrapper.classList.add("typewriter");
      wrapper.innerHTML = `<strong>${line.label}:</strong> ${line.value}`;
      block.appendChild(wrapper);
    });
    const container = document.getElementById("negation-output");
    container.innerHTML = "";
    container.appendChild(block);
  } catch (error) {
    showMessage("negation-output", `Negasi gagal: ${error.message}`);
  }
});

