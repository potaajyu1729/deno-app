const canvas = document.querySelector("#drawingCanvas");
const board = document.querySelector("#canvasBoard");
const notesLayer = document.querySelector("#notesLayer");
const paintApp = document.querySelector("#paintApp");
const toolBar = document.querySelector("#toolBar");
const brushCursor = document.querySelector("#brushCursor");
const colorInput = document.querySelector("#toolColor");
const colorOptions = document.querySelector("#colorOptions");
const sizeInput = document.querySelector("#brushSize");
const sizeOptions = document.querySelector("#sizeOptions");
const sizeValue = document.querySelector("#sizeValue");
const sizePreview = document.querySelector("#sizePreview");
const toolHint = document.querySelector("#toolHint");
const toolStatus = document.querySelector("#toolStatus");
const statusToolName = document.querySelector("#statusToolName");
const statusToolDot = document.querySelector("#statusToolDot");
const canvasSize = document.querySelector("#canvasSize");
const itemCount = document.querySelector("#itemCount");
const undoButton = document.querySelector("#undoButton");
const redoButton = document.querySelector("#redoButton");
const clearButton = document.querySelector("#clearButton");
const downloadButton = document.querySelector("#downloadButton");
const loadingScreen = document.querySelector("#loadingScreen");
const loadingText = document.querySelector("#loadingText");

const context = canvas.getContext("2d");

const TOOL_CONFIG = {
  pen: {
    name: "ペン",
    hint: "ドラッグして線を描きます",
    color: "#172033",
    size: 4,
    opacity: 1,
  },
  eraser: {
    name: "消しゴム",
    hint: "消したい線の上をなぞります",
    color: "#ffffff",
    size: 28,
    opacity: 1,
  },
  highlighter: {
    name: "蛍光ペン",
    hint: "半透明のラインで大切な部分を強調します",
    color: "#facc15",
    size: 22,
    opacity: 0.3,
  },
  note: {
    name: "付箋",
    hint: "キャンバスをクリックして付箋を貼ります",
    color: "#fde68a",
    size: 0,
    opacity: 1,
  },
};

const state = {
  activeTool: "pen",
  activePointerId: null,
  activeStroke: null,
  selectedNoteId: null,
  strokes: [],
  notes: [],
  undoStack: [],
  redoStack: [],
  topZIndex: 1,
  metrics: {
    width: 0,
    height: 0,
    dpr: 1,
  },
  settings: Object.fromEntries(
    Object.entries(TOOL_CONFIG).map(([tool, config]) => [
      tool,
      {
        color: config.color,
        size: config.size,
      },
    ]),
  ),
};

let renderFrame = 0;
let resizeObserver;

initPaintApp();
void finishLoading();

function initPaintApp() {
  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.addEventListener("click", () => selectTool(button.dataset.tool));
  });

  document.querySelectorAll("[data-color]").forEach((button) => {
    button.addEventListener(
      "click",
      () => setActiveColor(button.dataset.color),
    );
  });

  colorInput.addEventListener("input", () => setActiveColor(colorInput.value));
  sizeInput.addEventListener("input", () => {
    state.settings[state.activeTool].size = Number(sizeInput.value);
    updateToolControls();
  });

  canvas.addEventListener("pointerdown", handleCanvasPointerDown);
  canvas.addEventListener("pointermove", handleCanvasPointerMove);
  canvas.addEventListener("pointerup", finishActiveStroke);
  canvas.addEventListener("pointercancel", finishActiveStroke);
  canvas.addEventListener("lostpointercapture", handleLostPointerCapture);
  canvas.addEventListener("pointerenter", handleCanvasPointerEnter);
  canvas.addEventListener("pointerleave", handleCanvasPointerLeave);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  undoButton.addEventListener("click", undo);
  redoButton.addEventListener("click", redo);
  clearButton.addEventListener("click", clearCanvas);
  downloadButton.addEventListener("click", () => void downloadArtwork());
  document.addEventListener("keydown", handleKeyboardShortcut);
  window.addEventListener("blur", () => finishActiveStroke());
  window.addEventListener("resize", resizeCanvas);

  const mobileToolbar = window.matchMedia("(max-width: 760px)");
  const updateToolbarOrientation = () => {
    toolBar.setAttribute(
      "aria-orientation",
      mobileToolbar.matches ? "horizontal" : "vertical",
    );
  };
  updateToolbarOrientation();
  mobileToolbar.addEventListener?.("change", updateToolbarOrientation);

  if ("ResizeObserver" in window) {
    resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(board);
  }

  selectTool("pen", false);
  renderNotes();
  resizeCanvas();
  updateHistoryControls();
  updateItemCount();
}

async function finishLoading() {
  const messagePromise = fetch("/welcome-message")
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.text();
    })
    .catch(() => "");

  const [message] = await Promise.all([messagePromise, delay(1500)]);
  loadingText.textContent = message
    ? "キャンバスの準備ができました"
    : "オフラインで開始します";
  await delay(180);
  loadingScreen.classList.add("is-hidden");
  loadingScreen.setAttribute("aria-hidden", "true");
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function selectTool(tool, announceChange = true) {
  if (!TOOL_CONFIG[tool]) {
    return;
  }

  state.activeTool = tool;
  paintApp.dataset.activeTool = tool;

  document.querySelectorAll("[data-tool]").forEach((button) => {
    const isActive = button.dataset.tool === tool;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  updateToolControls();
  brushCursor.classList.remove("is-visible");

  if (announceChange) {
    announce(`${TOOL_CONFIG[tool].name}を選択しました`);
  }
}

function setActiveColor(color) {
  if (state.activeTool === "eraser" || !/^#[0-9a-f]{6}$/i.test(color)) {
    return;
  }

  state.settings[state.activeTool].color = color.toLowerCase();
  updateToolControls();
}

function updateToolControls() {
  const tool = state.activeTool;
  const setting = state.settings[tool];
  const config = TOOL_CONFIG[tool];
  const canChangeColor = tool !== "eraser";
  const canChangeSize = tool !== "note";

  colorInput.disabled = !canChangeColor;
  colorOptions.classList.toggle("is-disabled", !canChangeColor);
  colorOptions.setAttribute("aria-disabled", String(!canChangeColor));
  if (canChangeColor) {
    colorInput.value = setting.color;
  }

  sizeInput.disabled = !canChangeSize;
  sizeOptions.classList.toggle("is-disabled", !canChangeSize);
  sizeOptions.setAttribute("aria-disabled", String(!canChangeSize));
  if (canChangeSize) {
    sizeInput.value = String(setting.size);
  }

  const range = Number(sizeInput.max) - Number(sizeInput.min);
  const progress = ((Number(sizeInput.value) - Number(sizeInput.min)) / range) *
    100;
  sizeInput.style.setProperty("--range-fill", `${progress}%`);
  sizeValue.value = canChangeSize ? `${setting.size} px` : "—";

  const previewSize = canChangeSize
    ? Math.max(3, Math.min(setting.size, 22))
    : 12;
  const previewColor = tool === "eraser" ? "#f5f6fb" : setting.color;
  sizePreview.style.setProperty("--preview-size", `${previewSize}px`);
  sizePreview.style.setProperty("--preview-color", previewColor);

  document.querySelectorAll("[data-color]").forEach((button) => {
    const isSelected = canChangeColor &&
      button.dataset.color.toLowerCase() === setting.color.toLowerCase();
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });

  toolHint.lastChild.textContent = ` ${config.hint}`;
  statusToolName.textContent = config.name;
  statusToolDot.style.setProperty(
    "--status-color",
    tool === "eraser" ? "#94a3b8" : setting.color,
  );
  updateBrushCursorAppearance();
}

function handleCanvasPointerDown(event) {
  if (
    !event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)
  ) {
    return;
  }

  event.preventDefault();
  deselectNote();
  const point = getCanvasPoint(event);

  if (state.activeTool === "note") {
    createNote(point);
    return;
  }

  const config = TOOL_CONFIG[state.activeTool];
  const setting = state.settings[state.activeTool];
  state.activePointerId = event.pointerId;
  state.activeStroke = {
    id: createId("stroke"),
    tool: state.activeTool,
    color: setting.color,
    width: setting.size,
    opacity: config.opacity,
    points: [point],
  };

  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {
    // Pointer capture is an enhancement; drawing still works without it.
  }

  positionBrushCursor(event);
  requestCanvasRender();
}

function handleCanvasPointerMove(event) {
  positionBrushCursor(event);

  if (!state.activeStroke || event.pointerId !== state.activePointerId) {
    return;
  }

  event.preventDefault();
  appendStrokePoints(event);
  requestCanvasRender();
}

function finishActiveStroke(event) {
  if (!state.activeStroke) {
    return;
  }

  if (event && event.pointerId !== state.activePointerId) {
    return;
  }

  if (event) {
    appendStrokePoints(event);
  }

  const pointerId = state.activePointerId;
  const stroke = state.activeStroke;
  state.activePointerId = null;
  state.activeStroke = null;

  if (pointerId !== null && canvas.hasPointerCapture?.(pointerId)) {
    canvas.releasePointerCapture(pointerId);
  }

  executeCommand({
    type: "add-stroke",
    index: state.strokes.length,
    stroke,
  });
}

function handleLostPointerCapture(event) {
  if (state.activeStroke && event.pointerId === state.activePointerId) {
    finishActiveStroke(event);
  }
}

function handleCanvasPointerEnter(event) {
  if (state.activeTool !== "note") {
    positionBrushCursor(event);
    brushCursor.classList.add("is-visible");
  }
}

function handleCanvasPointerLeave() {
  if (!state.activeStroke) {
    brushCursor.classList.remove("is-visible");
  }
}

function appendStrokePoints(event) {
  const pointerEvents = event.getCoalescedEvents?.() ?? [event];

  for (const pointerEvent of pointerEvents) {
    const point = getCanvasPoint(pointerEvent);
    const lastPoint = state.activeStroke.points.at(-1);
    if (
      !lastPoint ||
      Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) >= 0.65
    ) {
      state.activeStroke.points.push(point);
    }
  }
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: clamp(event.clientX - rect.left, 0, state.metrics.width),
    y: clamp(event.clientY - rect.top, 0, state.metrics.height),
  };
}

function positionBrushCursor(event) {
  if (state.activeTool === "note") {
    brushCursor.classList.remove("is-visible");
    return;
  }

  const rect = board.getBoundingClientRect();
  brushCursor.style.left = `${event.clientX - rect.left}px`;
  brushCursor.style.top = `${event.clientY - rect.top}px`;
}

function updateBrushCursorAppearance() {
  const tool = state.activeTool;
  if (tool === "note") {
    brushCursor.classList.remove("is-visible");
    return;
  }

  const setting = state.settings[tool];
  const displaySize = Math.max(setting.size, 7);
  const color = tool === "eraser" ? "#64748b" : setting.color;
  let fill = "transparent";

  if (tool === "eraser") {
    fill = "rgb(255 255 255 / 78%)";
  } else if (tool === "highlighter") {
    fill = hexToRgba(setting.color, 0.28);
  } else if (setting.size <= 7) {
    fill = setting.color;
  }

  brushCursor.style.setProperty("--cursor-size", `${displaySize}px`);
  brushCursor.style.setProperty("--cursor-color", color);
  brushCursor.style.setProperty("--cursor-fill", fill);
}

function resizeCanvas() {
  const rect = board.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);

  if (width <= 0 || height <= 0) {
    return;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  const didChange = canvas.width !== pixelWidth ||
    canvas.height !== pixelHeight;

  state.metrics = { width, height, dpr };
  canvasSize.textContent = `${width} × ${height} px`;

  if (didChange) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    for (const note of state.notes) {
      note.x = clamp(note.x, 6, Math.max(6, width - note.width - 6));
      note.y = clamp(note.y, 6, Math.max(6, height - note.height - 6));
    }

    renderNotes();
    requestCanvasRender();
  }
}

function requestCanvasRender() {
  if (renderFrame) {
    return;
  }

  renderFrame = requestAnimationFrame(() => {
    renderFrame = 0;
    renderCanvas();
  });
}

function renderCanvas() {
  const { dpr } = state.metrics;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.restore();
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  for (const stroke of state.strokes) {
    drawStroke(stroke);
  }

  if (state.activeStroke) {
    drawStroke(state.activeStroke);
  }
}

function drawStroke(stroke) {
  const points = stroke.points;
  if (points.length === 0) {
    return;
  }

  context.save();
  context.globalCompositeOperation = stroke.tool === "eraser"
    ? "destination-out"
    : "source-over";
  context.globalAlpha = stroke.opacity;
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  context.lineWidth = stroke.width;
  context.lineCap = "round";
  context.lineJoin = "round";

  if (points.length === 1) {
    context.beginPath();
    context.arc(points[0].x, points[0].y, stroke.width / 2, 0, Math.PI * 2);
    context.fill();
    context.restore();
    return;
  }

  context.beginPath();
  context.moveTo(points[0].x, points[0].y);

  if (points.length === 2) {
    context.lineTo(points[1].x, points[1].y);
  } else {
    for (let index = 1; index < points.length - 1; index += 1) {
      const point = points[index];
      const nextPoint = points[index + 1];
      const midpoint = {
        x: (point.x + nextPoint.x) / 2,
        y: (point.y + nextPoint.y) / 2,
      };
      context.quadraticCurveTo(point.x, point.y, midpoint.x, midpoint.y);
    }
    context.lineTo(points.at(-1).x, points.at(-1).y);
  }

  context.stroke();
  context.restore();
}

function createNote(point) {
  const compact = state.metrics.width < 480;
  const width = Math.min(compact ? 188 : 208, state.metrics.width - 16);
  const height = Math.min(compact ? 154 : 168, state.metrics.height - 16);
  const note = {
    id: createId("note"),
    x: clamp(
      point.x - width / 2,
      8,
      Math.max(8, state.metrics.width - width - 8),
    ),
    y: clamp(point.y - 24, 8, Math.max(8, state.metrics.height - height - 8)),
    width,
    height,
    color: state.settings.note.color,
    text: "",
    rotation: [-1.2, 0.7, -0.5, 1][state.notes.length % 4],
    zIndex: ++state.topZIndex,
  };

  state.selectedNoteId = note.id;
  executeCommand({
    type: "add-note",
    index: state.notes.length,
    note,
  });

  requestAnimationFrame(() => {
    notesLayer.querySelector(`[data-note-id="${note.id}"] textarea`)?.focus();
  });
  announce("付箋を追加しました。文字を入力できます");
}

function renderNotes() {
  const fragment = document.createDocumentFragment();

  for (const [index, note] of state.notes.entries()) {
    const article = document.createElement("article");
    article.className = "sticky-note";
    article.dataset.noteId = note.id;
    article.setAttribute("aria-label", `付箋 ${index + 1}`);
    article.style.left = `${note.x}px`;
    article.style.top = `${note.y}px`;
    article.style.width = `${note.width}px`;
    article.style.height = `${note.height}px`;
    article.style.zIndex = String(note.zIndex);
    article.style.setProperty("--note-color", note.color);
    article.style.setProperty(
      "--note-ink",
      getContrastingTextColor(note.color),
    );
    article.style.setProperty("--note-rotation", `${note.rotation}deg`);
    article.classList.toggle("is-selected", note.id === state.selectedNoteId);

    const handle = document.createElement("div");
    handle.className = "note-handle";
    handle.tabIndex = 0;
    handle.setAttribute("role", "button");
    handle.setAttribute("aria-label", "付箋を移動。矢印キーでも移動できます");

    const grip = document.createElement("span");
    grip.className = "note-grip";
    grip.setAttribute("aria-hidden", "true");
    for (let dot = 0; dot < 5; dot += 1) {
      grip.append(document.createElement("i"));
    }

    const deleteButton = document.createElement("button");
    deleteButton.className = "note-delete";
    deleteButton.type = "button";
    deleteButton.setAttribute("aria-label", "この付箋を削除");
    deleteButton.innerHTML =
      '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m7 7 10 10M17 7 7 17"/></svg>';

    const textarea = document.createElement("textarea");
    textarea.value = note.text;
    textarea.placeholder = "ここにメモを書く…";
    textarea.setAttribute("aria-label", `付箋 ${index + 1} の内容`);

    handle.append(grip, deleteButton);
    article.append(handle, textarea);
    fragment.append(article);

    article.addEventListener("pointerdown", () => selectNote(note.id));
    handle.addEventListener(
      "pointerdown",
      (event) => startNoteDrag(event, note, article, handle),
    );
    handle.addEventListener(
      "keydown",
      (event) => handleNoteKeyboard(event, note, article),
    );
    deleteButton.addEventListener(
      "pointerdown",
      (event) => event.stopPropagation(),
    );
    deleteButton.addEventListener("click", () => deleteNote(note.id));

    let textAtFocus = note.text;
    textarea.addEventListener("focus", () => {
      selectNote(note.id);
      textAtFocus = note.text;
    });
    textarea.addEventListener("input", () => {
      note.text = textarea.value;
    });
    textarea.addEventListener("blur", () => {
      if (textAtFocus !== note.text) {
        recordCommand({
          type: "edit-note",
          noteId: note.id,
          before: textAtFocus,
          after: note.text,
        });
      }
    });
  }

  notesLayer.replaceChildren(fragment);
}

function selectNote(noteId) {
  const note = findNote(noteId);
  if (!note) {
    return;
  }

  state.selectedNoteId = noteId;
  note.zIndex = ++state.topZIndex;

  notesLayer.querySelectorAll(".sticky-note").forEach((element) => {
    const isSelected = element.dataset.noteId === noteId;
    element.classList.toggle("is-selected", isSelected);
    if (isSelected) {
      element.style.zIndex = String(note.zIndex);
    }
  });
}

function deselectNote() {
  state.selectedNoteId = null;
  notesLayer.querySelectorAll(".sticky-note").forEach((element) => {
    element.classList.remove("is-selected");
  });
}

function startNoteDrag(event, note, article, handle) {
  if (
    !event.isPrimary || (event.pointerType === "mouse" && event.button !== 0) ||
    event.target.closest("button")
  ) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  selectNote(note.id);
  article.classList.add("is-dragging");

  const start = {
    pointerX: event.clientX,
    pointerY: event.clientY,
    noteX: note.x,
    noteY: note.y,
  };
  let finished = false;

  try {
    handle.setPointerCapture(event.pointerId);
  } catch {
    // Continue with regular pointer events if capture is unavailable.
  }

  const move = (moveEvent) => {
    const x = start.noteX + moveEvent.clientX - start.pointerX;
    const y = start.noteY + moveEvent.clientY - start.pointerY;
    note.x = clamp(x, 6, Math.max(6, state.metrics.width - note.width - 6));
    note.y = clamp(y, 6, Math.max(6, state.metrics.height - note.height - 6));
    article.style.left = `${note.x}px`;
    article.style.top = `${note.y}px`;
  };

  const end = () => {
    if (finished) {
      return;
    }
    finished = true;
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", end);
    handle.removeEventListener("pointercancel", end);
    handle.removeEventListener("lostpointercapture", end);
    article.classList.remove("is-dragging");

    const before = { x: start.noteX, y: start.noteY };
    const after = { x: note.x, y: note.y };
    if (before.x !== after.x || before.y !== after.y) {
      recordCommand({
        type: "move-note",
        noteId: note.id,
        before,
        after,
      });
    }
  };

  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
  handle.addEventListener("lostpointercapture", end);
}

function handleNoteKeyboard(event, note, article) {
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    deleteNote(note.id);
    return;
  }

  const movement = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  }[event.key];

  if (!movement) {
    return;
  }

  event.preventDefault();
  const distance = event.shiftKey ? 10 : 2;
  const before = { x: note.x, y: note.y };
  note.x = clamp(
    note.x + movement[0] * distance,
    6,
    Math.max(6, state.metrics.width - note.width - 6),
  );
  note.y = clamp(
    note.y + movement[1] * distance,
    6,
    Math.max(6, state.metrics.height - note.height - 6),
  );
  article.style.left = `${note.x}px`;
  article.style.top = `${note.y}px`;

  if (before.x !== note.x || before.y !== note.y) {
    recordCommand({
      type: "move-note",
      noteId: note.id,
      before,
      after: { x: note.x, y: note.y },
    });
  }
}

function deleteNote(noteId) {
  const index = state.notes.findIndex((note) => note.id === noteId);
  if (index === -1) {
    return;
  }

  executeCommand({
    type: "delete-note",
    index,
    note: state.notes[index],
  });
  announce("付箋を削除しました");
}

function executeCommand(command) {
  applyCommand(command);
  recordCommand(command);
  syncAfterCommand(command);
}

function recordCommand(command) {
  state.undoStack.push(command);
  if (state.undoStack.length > 100) {
    state.undoStack.shift();
  }
  state.redoStack.length = 0;
  updateHistoryControls();
}

function applyCommand(command) {
  switch (command.type) {
    case "add-stroke":
      state.strokes.splice(command.index, 0, command.stroke);
      break;
    case "add-note":
      state.notes.splice(command.index, 0, command.note);
      state.selectedNoteId = command.note.id;
      break;
    case "delete-note":
      state.notes.splice(
        state.notes.findIndex((note) => note.id === command.note.id),
        1,
      );
      if (state.selectedNoteId === command.note.id) {
        state.selectedNoteId = null;
      }
      break;
    case "move-note": {
      const note = findNote(command.noteId);
      if (note) {
        Object.assign(note, command.after);
      }
      break;
    }
    case "edit-note": {
      const note = findNote(command.noteId);
      if (note) {
        note.text = command.after;
      }
      break;
    }
    case "clear":
      state.strokes = [];
      state.notes = [];
      state.selectedNoteId = null;
      break;
  }
}

function revertCommand(command) {
  switch (command.type) {
    case "add-stroke":
      state.strokes = state.strokes.filter((stroke) =>
        stroke.id !== command.stroke.id
      );
      break;
    case "add-note":
      state.notes = state.notes.filter((note) => note.id !== command.note.id);
      if (state.selectedNoteId === command.note.id) {
        state.selectedNoteId = null;
      }
      break;
    case "delete-note":
      state.notes.splice(command.index, 0, command.note);
      state.selectedNoteId = command.note.id;
      break;
    case "move-note": {
      const note = findNote(command.noteId);
      if (note) {
        Object.assign(note, command.before);
      }
      break;
    }
    case "edit-note": {
      const note = findNote(command.noteId);
      if (note) {
        note.text = command.before;
      }
      break;
    }
    case "clear":
      state.strokes = command.strokes.slice();
      state.notes = command.notes.slice();
      state.selectedNoteId = command.selectedNoteId;
      break;
  }
}

function undo() {
  const command = state.undoStack.pop();
  if (!command) {
    return;
  }

  revertCommand(command);
  state.redoStack.push(command);
  syncAfterCommand(command);
  updateHistoryControls();
  announce("操作を元に戻しました");
}

function redo() {
  const command = state.redoStack.pop();
  if (!command) {
    return;
  }

  applyCommand(command);
  state.undoStack.push(command);
  syncAfterCommand(command);
  updateHistoryControls();
  announce("操作をやり直しました");
}

function syncAfterCommand(command) {
  requestCanvasRender();

  if (command.type !== "add-stroke") {
    renderNotes();
  }

  updateItemCount();
  updateHistoryControls();
}

function updateHistoryControls() {
  undoButton.disabled = state.undoStack.length === 0;
  redoButton.disabled = state.redoStack.length === 0;
  clearButton.disabled = state.strokes.length === 0 && state.notes.length === 0;
}

function updateItemCount() {
  itemCount.textContent =
    `${state.strokes.length} strokes · ${state.notes.length} notes`;
  clearButton.disabled = state.strokes.length === 0 && state.notes.length === 0;
}

function clearCanvas() {
  if (state.strokes.length === 0 && state.notes.length === 0) {
    return;
  }

  const shouldClear = window.confirm(
    "すべての線と付箋を消去しますか？\nこの操作は「戻す」で復元できます。",
  );
  if (!shouldClear) {
    return;
  }

  executeCommand({
    type: "clear",
    strokes: state.strokes.slice(),
    notes: state.notes.slice(),
    selectedNoteId: state.selectedNoteId,
  });
  announce("キャンバスを消去しました");
}

function handleKeyboardShortcut(event) {
  const target = event.target;
  const isEditing = target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable;

  if ((event.ctrlKey || event.metaKey) && !event.altKey && !isEditing) {
    if (event.key.toLowerCase() === "z") {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
      return;
    }
    if (event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
      return;
    }
  }

  if (isEditing || event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }

  const toolShortcut = {
    p: "pen",
    e: "eraser",
    h: "highlighter",
    n: "note",
  }[event.key.toLowerCase()];

  if (toolShortcut) {
    event.preventDefault();
    selectTool(toolShortcut);
    return;
  }

  if (
    (event.key === "Delete" || event.key === "Backspace") &&
    state.selectedNoteId
  ) {
    event.preventDefault();
    deleteNote(state.selectedNoteId);
  } else if (event.key === "Escape") {
    deselectNote();
  } else if (
    (event.key === "[" || event.key === "]") && state.activeTool !== "note"
  ) {
    event.preventDefault();
    const delta = event.key === "[" ? -1 : 1;
    const setting = state.settings[state.activeTool];
    setting.size = clamp(
      setting.size + delta,
      Number(sizeInput.min),
      Number(sizeInput.max),
    );
    updateToolControls();
  }
}

async function downloadArtwork() {
  const width = state.metrics.width;
  const height = state.metrics.height;
  if (width <= 0 || height <= 0) {
    return;
  }

  downloadButton.disabled = true;

  try {
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const output = document.createElement("canvas");
    output.width = Math.round(width * scale);
    output.height = Math.round(height * scale);
    const outputContext = output.getContext("2d");
    outputContext.scale(scale, scale);

    outputContext.fillStyle = "#ffffff";
    outputContext.fillRect(0, 0, width, height);
    outputContext.fillStyle = "#d9deea";
    for (let y = 21; y < height; y += 22) {
      for (let x = 21; x < width; x += 22) {
        outputContext.beginPath();
        outputContext.arc(x, y, 1, 0, Math.PI * 2);
        outputContext.fill();
      }
    }

    outputContext.drawImage(
      canvas,
      0,
      0,
      canvas.width,
      canvas.height,
      0,
      0,
      width,
      height,
    );

    const notesByDepth = [...state.notes].sort((a, b) => a.zIndex - b.zIndex);
    for (const note of notesByDepth) {
      drawNoteForExport(outputContext, note);
    }

    const blob = await new Promise((resolve) =>
      output.toBlob(resolve, "image/png")
    );
    if (!blob) {
      throw new Error("PNGの生成に失敗しました");
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const now = new Date();
    const timestamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      "-",
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
    ].join("");
    link.href = url;
    link.download = `doodle-desk-${timestamp}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce("PNG画像を保存しました");
  } catch (error) {
    console.error(error);
    announce("画像を保存できませんでした");
  } finally {
    downloadButton.disabled = false;
  }
}

function drawNoteForExport(outputContext, note) {
  const centerX = note.x + note.width / 2;
  const centerY = note.y + note.height / 2;
  outputContext.save();
  outputContext.translate(centerX, centerY);
  outputContext.rotate(note.rotation * Math.PI / 180);
  outputContext.translate(-centerX, -centerY);
  outputContext.shadowColor = "rgb(53 47 28 / 20%)";
  outputContext.shadowBlur = 18;
  outputContext.shadowOffsetY = 10;
  roundedRectangle(outputContext, note.x, note.y, note.width, note.height, 7);
  outputContext.fillStyle = note.color;
  outputContext.fill();
  outputContext.shadowColor = "transparent";

  outputContext.fillStyle = "rgb(255 255 255 / 12%)";
  outputContext.fillRect(note.x, note.y, note.width, 34);
  outputContext.strokeStyle = "rgb(55 48 25 / 8%)";
  outputContext.beginPath();
  outputContext.moveTo(note.x, note.y + 34);
  outputContext.lineTo(note.x + note.width, note.y + 34);
  outputContext.stroke();

  outputContext.fillStyle = getContrastingTextColor(note.color);
  outputContext.font = '14px "Yu Gothic UI", "Yu Gothic", sans-serif';
  outputContext.textBaseline = "top";
  const lines = wrapCanvasText(outputContext, note.text, note.width - 26);
  const lineHeight = 23;
  const maxLines = Math.max(1, Math.floor((note.height - 53) / lineHeight));
  const visibleLines = lines.slice(0, maxLines);
  if (lines.length > maxLines && visibleLines.length > 0) {
    visibleLines[visibleLines.length - 1] = `${
      visibleLines.at(-1).slice(0, -1)
    }…`;
  }
  visibleLines.forEach((line, index) => {
    outputContext.fillText(line, note.x + 13, note.y + 45 + index * lineHeight);
  });
  outputContext.restore();
}

function wrapCanvasText(outputContext, text, maxWidth) {
  const lines = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }

    let line = "";
    for (const character of paragraph) {
      const candidate = line + character;
      if (line && outputContext.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = character;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

function roundedRectangle(outputContext, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  outputContext.beginPath();
  outputContext.moveTo(x + safeRadius, y);
  outputContext.arcTo(x + width, y, x + width, y + height, safeRadius);
  outputContext.arcTo(x + width, y + height, x, y + height, safeRadius);
  outputContext.arcTo(x, y + height, x, y, safeRadius);
  outputContext.arcTo(x, y, x + width, y, safeRadius);
  outputContext.closePath();
}

function findNote(noteId) {
  return state.notes.find((note) => note.id === noteId);
}

function getContrastingTextColor(hexColor) {
  const red = Number.parseInt(hexColor.slice(1, 3), 16);
  const green = Number.parseInt(hexColor.slice(3, 5), 16);
  const blue = Number.parseInt(hexColor.slice(5, 7), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance > 145 ? "#3f3b2d" : "#ffffff";
}

function hexToRgba(hexColor, alpha) {
  const red = Number.parseInt(hexColor.slice(1, 3), 16);
  const green = Number.parseInt(hexColor.slice(3, 5), 16);
  const blue = Number.parseInt(hexColor.slice(5, 7), 16);
  return `rgb(${red} ${green} ${blue} / ${alpha})`;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function createId(prefix) {
  return `${prefix}-${
    crypto.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }`;
}

function announce(message) {
  toolStatus.textContent = "";
  requestAnimationFrame(() => {
    toolStatus.textContent = message;
  });
}
