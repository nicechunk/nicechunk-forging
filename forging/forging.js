import * as THREE from "three";
import "../src/site-header.css";
import "../src/site-ui.js";
import { initI18n, t } from "../src/i18n.js";
import { getEquippedBackpackStatus } from "../src/chain/nicechunkChain.js";
import {
  smeltingFuelForMaterialId,
  smeltingMaterialBaseAttributes,
  smeltingMaterialById,
  smeltingMaterialIdForItemCode,
} from "../src/data/smeltingRules.js";
import { saveForgedItem } from "../src/forgedItems.js";
import { DEFAULT_RESOURCE_DIMENSIONS_M } from "../src/physics/resourceMass.js";
import { createAvatar, createAvatarMaterials } from "../src/render/avatar.js";
import {
  createResourceMaterialPreviewCanvas,
  resourceMaterialColors,
} from "../src/render/resourcePreview.js";

const canvas = document.querySelector("#forgeScene");
const statusText = document.querySelector("#statusText");
const shapeText = document.querySelector("#shapeText");
const resetCameraButton = document.querySelector("#resetCamera");
const hammerModeButton = document.querySelector("#hammerMode");
const resourceGrid = document.querySelector("#resourceGrid");
const refreshMaterialsButton = document.querySelector("#refreshMaterials");
const materialValue = document.querySelector("#materialValue");
const heatValue = document.querySelector("#heatValue");
const massValue = document.querySelector("#massValue");
const shapeValue = document.querySelector("#shapeValue");
const attributePanel = document.querySelector("#attributePanel");
const normalizeButton = document.querySelector("#normalizePiece");
const clearButton = document.querySelector("#clearPiece");
const castButton = document.querySelector("#castPiece");
const castFooterButton = document.querySelector("#castPieceFooter");
const saveDraftButton = document.querySelector("#saveDraft");
const saveDraftAsNewButton = document.querySelector("#saveDraftAsNew");
const draftList = document.querySelector("#draftList");
const forgeContextMenu = document.querySelector("#forgeContextMenu");
const contextRotateButtons = document.querySelectorAll("[data-context-rotate-axis]");
const contextRemoveButton = document.querySelector("[data-context-remove]");
const showChainCodeButton = document.querySelector("#showChainCode");
const chainModal = document.querySelector("#chainModal");
const closeChainCodeButton = document.querySelector("#closeChainCode");
const generateChainCodeButton = document.querySelector("#generateChainCode");
const saveChainCodeButton = document.querySelector("#saveChainCode");
const copyChainCodeButton = document.querySelector("#copyChainCode");
const chainCodeOutput = document.querySelector("#chainCodeOutput");
const toolHotbar = document.querySelector("#toolHotbar");

await initI18n();

const resources = {
  iron: { color: 0x9ca4a2, heat: 18, mass: 12, densityKgM3: 5200, hardness: 0.88, dims: [1.18, 0.72, 1.02], nameKey: "forging.resource.iron.name" },
  copper: { color: 0xb96d45, heat: 12, mass: 10, densityKgM3: 5600, hardness: 0.56, dims: [1.02, 0.62, 0.92], nameKey: "forging.resource.copper.name" },
  tin: { color: 0xc8cfbd, heat: 10, mass: 8, densityKgM3: 7300, hardness: 0.42, dims: [0.92, 0.56, 0.84], nameKey: "forging.resource.tin.name" },
  coal: { color: 0x2d2b28, heat: 38, mass: 2, densityKgM3: 1350, hardness: 0.2, nameKey: "forging.resource.coal.name", fuel: true },
  handle: { color: 0x7b5438, heat: 6, mass: 4, densityKgM3: 720, hardness: 0.34, dims: [0.42, 1.18, 0.42], nameKey: "forging.resource.handle.name", role: "grip" },
};
const forgeMetersPerSceneUnit = DEFAULT_RESOURCE_DIMENSIONS_M.width;
const defaultResourceVolumeMm3 = Math.round(
  DEFAULT_RESOURCE_DIMENSIONS_M.width *
  DEFAULT_RESOURCE_DIMENSIONS_M.height *
  DEFAULT_RESOURCE_DIMENSIONS_M.depth *
  1_000_000_000,
);
const defaultForgeMaterialDims = [
  metersToForgeSceneUnits(DEFAULT_RESOURCE_DIMENSIONS_M.width),
  metersToForgeSceneUnits(DEFAULT_RESOURCE_DIMENSIONS_M.height),
  metersToForgeSceneUnits(DEFAULT_RESOURCE_DIMENSIONS_M.depth),
];
const smeltingClassColors = {
  carbon: 0x2b2a24,
  fiber: 0x9d8f56,
  polymer: 0xbd8a54,
  ceramic: 0xc9a16c,
  glass: 0x8de8ff,
  flux: 0xd8dfbd,
  stone: 0x87909b,
  metal: 0xc8d2d6,
  alloy: 0xaeb9c1,
  composite: 0x6bd6c8,
};
const tools = [
  { id: "gloves", key: "forging.tool.gloves", hotkey: "1" },
  { id: "hammer", key: "forging.tool.hammer", hotkey: "2" },
  { id: "saw", key: "forging.tool.saw", hotkey: "3" },
  { id: "handDrill", key: "forging.tool.handDrill", hotkey: "4" },
  { id: "grip", key: "forging.tool.grip", hotkey: "5" },
  { id: "axe", key: "forging.tool.axe", hotkey: "6" },
  { id: "sprayGun", key: "forging.tool.sprayGun", hotkey: "7" },
  { id: "empty8", key: "forging.tool.empty", hotkey: "8", disabled: true },
  { id: "empty9", key: "forging.tool.empty", hotkey: "9", disabled: true },
];
const resourceIds = Object.keys(resources);
const forgeCodePrefix = "NCF1.";
const legacyAppearanceVersion = 3;
const forgeAppearanceVersion = 4;
const appearanceGrid = { x: 24, y: 24, z: 24 };
const forgeDraftsStorageKey = "nicechunk.forging.drafts.v1";
const activeForgeDraftStorageKey = "nicechunk.forging.activeDraft";
const maxForgeDrafts = 24;
const workpieceBaseY = 1.92;
const forgeTopY = 1.49;
const settleStep = 0.04;
const settleMaxSteps = 420;
const staticCollisionBoxes = [];
const staticSupportSurfaces = [
  { y: forgeTopY, minX: -1.68, maxX: 1.68, minZ: -1.68, maxZ: 1.68 },
  { y: -0.72, minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity },
];
const axisLabelKeys = {
  x: "forging.axis.front",
  y: "forging.axis.up",
  z: "forging.axis.right",
};
const toolCursorUrls = Object.fromEntries([
  ["gloves", toolCursorUrl("gloves")],
  ["hammer", toolCursorUrl("hammer")],
  ["saw", toolCursorUrl("saw")],
  ["handDrill", toolCursorUrl("handDrill")],
  ["grip", toolCursorUrl("grip")],
  ["axe", toolCursorUrl("axe")],
  ["sprayGun", toolCursorUrl("sprayGun")],
]);
const avatarHandGripSize = new THREE.Vector3(0.34, 0.42, 0.32);
const avatarHandGripFootprint = new THREE.Vector2(avatarHandGripSize.x, avatarHandGripSize.y);
const avatarGripHandAnchor = new THREE.Vector3(0, -0.99, 0);
const gripGestureRotationStepRadians = Math.PI / 2;
const gripContactVisualOffset = 0.012;
const gripContactConformDepth = avatarHandGripSize.z * 0.55;
const gripHandEmbedDepth = Math.min(avatarHandGripSize.z * 0.22, gripContactConformDepth * 0.45);
const minimumGripContactCoverage = 0.18;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x89b7c8);
scene.fog = new THREE.Fog(0x89b7c8, 18, 72);

const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 120);
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = false;

const avatarCubeGeometry = new THREE.BoxGeometry(1, 1, 1);
const forgeAvatar = createAvatar({
  THREE,
  cubeGeometry: avatarCubeGeometry,
  materials: createAvatarMaterials(THREE),
});
forgeAvatar.position.set(-6.3, -0.72, -4.3);
faceForgeAvatarToBench();
scene.add(forgeAvatar);
forgeAvatar.userData.limbs.rightTool.visible = false;
forgeAvatar.userData.limbs.heldBlock.visible = false;
let forgeAvatarEquippedMesh = null;
let previewCode = "";
let equipmentPreviewDirty = true;
const gripFailureAnimations = [];
const gripCollisionAttemptAnimations = [];
const gripCollisionFlashAnimations = [];
const avatarCollisionProbeFlashAnimations = [];
const avatarCollisionPartFlashAnimations = [];

scene.add(new THREE.HemisphereLight(0xf8fbff, 0x6d704f, 3.35));
const sun = new THREE.DirectionalLight(0xfff0cf, 3.35);
sun.position.set(-8, 12, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const target = new THREE.Vector3(-1.8, 1.1, -1.35);
const clock = new THREE.Clock();
let yaw = -0.72;
let pitch = 0.38;
let distance = 9.2;
let rotatingCamera = false;
let cameraPointerId = null;
let leftPointerDown = false;
let leftPointerMoved = false;
let lastPointerX = 0;
let lastPointerY = 0;
let selectedTool = "gloves";
let hammerEnabled = false;
let backpackMaterialEntries = [];
let backpackMaterialStatus = "idle";
const usedBackpackMaterialEntryKeys = new Set();
let moveEnabled = true;
let sawEnabled = false;
let drillEnabled = false;
let gripEnabled = false;
let gripGestureRotationStep = 0;
let hoveredFace = null;
let strike = null;
let toolAction = null;
let activeDrag = null;
let activeDraftId = localStorage.getItem(activeForgeDraftStorageKey) || "";
let activeDraftContextId = "";
const activeTouchPointers = new Map();
let pinchGesture = null;
let currentChainCode = "";
const toolSettings = {
  saw: { angle: 0 },
  drill: { size: 3 },
};
const toolSettingsMenu = createToolSettingsMenu();
const draftContextMenu = createDraftContextMenu();
renderDraftContextMenu();

const forgeRoot = new THREE.Group();
scene.add(forgeRoot);

const forgeFireBlocks = [];
const forgeFireLight = new THREE.PointLight(0xff8c00, 2.4, 9);
forgeFireLight.position.set(0, 0.96, 1.02);
scene.add(forgeFireLight);

const forgeBase = createBox(3.45, 0.28, 3.45, 0x20201f);
forgeBase.position.set(0, 0.12, 0);
forgeBase.castShadow = true;
forgeBase.receiveShadow = true;
forgeRoot.add(forgeBase);

for (const [x, z, width, depth] of [
  [0, -1.34, 3.08, 0.4],
  [-1.34, 0, 0.4, 3.08],
  [1.34, 0, 0.4, 3.08],
  [-1.02, 1.34, 1.04, 0.4],
  [1.02, 1.34, 1.04, 0.4],
]) {
  const bodyPanel = createBox(width, 1.12, depth, 0x333333);
  bodyPanel.position.set(x, 0.72, z);
  bodyPanel.castShadow = true;
  bodyPanel.receiveShadow = true;
  forgeRoot.add(bodyPanel);
}

const frontSill = createBox(1.1, 0.24, 0.4, 0x252525);
frontSill.position.set(0, 0.28, 1.34);
frontSill.castShadow = true;
frontSill.receiveShadow = true;
forgeRoot.add(frontSill);

const forgeDeckInnerSize = 2.76;
const forgeRimThickness = 0.32;
const forgeRimCenter = forgeDeckInnerSize * 0.5 + forgeRimThickness * 0.5;
const forgeOuterSize = forgeDeckInnerSize + forgeRimThickness * 2;

const forgeDeck = createBox(forgeDeckInnerSize, 0.22, forgeDeckInnerSize, 0x565656);
forgeDeck.position.set(0, 1.38, 0);
forgeDeck.castShadow = true;
forgeDeck.receiveShadow = true;
forgeRoot.add(forgeDeck);

const forgeFireCore = createBox(0.88, 0.2, 0.88, 0xff4500, {
  material: new THREE.MeshBasicMaterial({ color: 0xff4500, transparent: true, opacity: 0.68 }),
});
forgeFireCore.position.set(0, 0.94, 1.02);
forgeFireCore.renderOrder = 3;
forgeRoot.add(forgeFireCore);
forgeFireBlocks.push(forgeFireCore);

for (const [x, z, scale, color] of [
  [-0.34, -0.22, 0.64, 0xff8c00],
  [0.3, -0.08, 0.52, 0xffbf00],
  [-0.06, 0.32, 0.58, 0xff5a18],
]) {
  const ember = createBox(0.34 * scale, 0.22 * scale, 0.34 * scale, color, {
    material: new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.62 }),
  });
  ember.position.set(x, 1.02 + scale * 0.03, z + 1.02);
  ember.renderOrder = 4;
  forgeRoot.add(ember);
  forgeFireBlocks.push(ember);
}

for (const [x, z] of [
  [-1.42, -1.42],
  [1.42, -1.42],
  [-1.42, 1.42],
  [1.42, 1.42],
]) {
  const corner = createBox(0.42, 1.08, 0.42, 0x2a2a2a);
  corner.position.set(x, 0.72, z);
  corner.castShadow = true;
  corner.receiveShadow = true;
  forgeRoot.add(corner);
}

for (const [x, z, width, depth] of [
  [0, -forgeRimCenter, forgeOuterSize, forgeRimThickness],
  [0, forgeRimCenter, forgeOuterSize, forgeRimThickness],
  [-forgeRimCenter, 0, forgeRimThickness, forgeDeckInnerSize],
  [forgeRimCenter, 0, forgeRimThickness, forgeDeckInnerSize],
]) {
  const rim = createBox(width, 0.22, depth, 0x1a1a1a);
  rim.position.set(x, 1.38, z);
  rim.castShadow = true;
  rim.receiveShadow = true;
  forgeRoot.add(rim);
}

const ground = createBox(22, 0.08, 22, 0x3a5130);
ground.position.y = -0.78;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(22, 22, 0x60704e, 0x405038);
grid.position.y = -0.72;
scene.add(grid);

const workMaterial = new THREE.MeshStandardMaterial({
  color: 0xb46f42,
  roughness: 0.68,
  metalness: 0.45,
});
const emptyGeometry = new THREE.BufferGeometry();
const voxelGrid = { x: 14, y: 10, z: 14 };

const moveGizmo = createMoveGizmo();
moveGizmo.visible = false;
scene.add(moveGizmo);
const moveHandles = [];
moveGizmo.traverse((child) => {
  if (child.userData.axis) moveHandles.push(child);
});

const faceMarker = new THREE.Group();
const faceMarkerSurface = new THREE.Mesh(
  emptyGeometry.clone(),
  new THREE.MeshBasicMaterial({ color: 0xffc76a, transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false }),
);
const faceMarkerLines = new THREE.LineSegments(
  emptyGeometry.clone(),
  new THREE.LineBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.95 }),
);
faceMarker.add(faceMarkerSurface, faceMarkerLines);
faceMarker.visible = false;
scene.add(faceMarker);

const gripBindingMarker = new THREE.Group();
const gripBindingSurface = new THREE.Mesh(
  emptyGeometry.clone(),
  new THREE.MeshBasicMaterial({ color: 0x45ff8a, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
);
const gripBindingLines = new THREE.LineSegments(
  emptyGeometry.clone(),
  new THREE.LineBasicMaterial({ color: 0xc5ffd8, transparent: true, opacity: 0.95 }),
);
gripBindingMarker.add(gripBindingSurface, gripBindingLines);
gripBindingMarker.visible = false;
scene.add(gripBindingMarker);

const hammer = createHammer();
hammer.visible = false;
scene.add(hammer);
const saw = createSaw();
saw.visible = false;
scene.add(saw);
const handDrill = createHandDrill();
handDrill.visible = false;
scene.add(handDrill);
const gripHand = createGripHand();
gripHand.visible = false;
scene.add(gripHand);

const pieces = [];
const selectableMeshes = [];
let selectedPiece = null;
let nextPieceId = 1;

resetCamera();
resize();
updateHud();
renderToolHotbar();
renderDraftList();
renderBackpackMaterials();
void syncBackpackMaterials();
setStatus("forging.status.glovesReady");
animate();

window.addEventListener("resize", resize);
window.addEventListener("blur", finishShapeToolAction);
canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
}, false);
canvas.addEventListener("webglcontextrestored", () => {
  resize();
  updateCamera();
  pieces.forEach(updatePiece);
}, false);
window.addEventListener("nicechunk:languagechange", () => {
  updateHud();
  renderToolHotbar();
  renderDraftList();
  renderDraftContextMenu();
  renderBackpackMaterials();
  updateAxisLabels();
  renderToolSettingsMenu();
  if (statusText.dataset.statusKey) statusText.textContent = t(statusText.dataset.statusKey);
});

resetCameraButton.addEventListener("click", resetCamera);
hammerModeButton.addEventListener("click", () => selectTool(selectedTool === "hammer" ? "gloves" : "hammer"));
normalizeButton.addEventListener("click", normalizePiece);
clearButton.addEventListener("click", clearPiece);
castButton.addEventListener("click", castWorkbench);
castFooterButton?.addEventListener("click", () => castButton?.click());
saveDraftButton.addEventListener("click", () => saveCurrentDraft(false));
saveDraftAsNewButton.addEventListener("click", () => saveCurrentDraft(true));
contextRotateButtons.forEach((button) => {
  button.addEventListener("click", () => {
    hideForgeContextMenu();
    rotateSelectedPiece(button.dataset.contextRotateAxis);
  });
});
contextRemoveButton?.addEventListener("click", () => {
  hideForgeContextMenu();
  removeSelectedPiece();
});
showChainCodeButton.addEventListener("click", openChainCodeModal);
closeChainCodeButton.addEventListener("click", closeChainCodeModal);
chainModal.addEventListener("click", (event) => {
  if (event.target === chainModal) closeChainCodeModal();
});
copyChainCodeButton.addEventListener("click", async () => {
  const code = chainCodeOutput.value.trim() || currentChainCode;
  if (!code) return;
  await navigator.clipboard?.writeText(code);
  setStatus("forging.status.chainCopied");
});
generateChainCodeButton.addEventListener("click", generateFromChainCode);
saveChainCodeButton.addEventListener("click", () => {
  const inputCode = chainCodeOutput.value.trim();
  if (inputCode) {
    let blueprint;
    try {
      blueprint = decodeForgeCode(inputCode);
    } catch (_error) {
      setStatus("forging.status.invalidChainCode");
      return;
    }
    if (!blueprint.appearance && !blueprint.components?.length) {
      setStatus("forging.status.invalidChainCode");
      return;
    }
    currentChainCode = inputCode;
  } else {
    ensureCurrentChainCode();
  }
  if (!currentChainCode) {
    setStatus("forging.status.noChainCode");
    return;
  }
  saveForgedItem(currentChainCode);
  setStatus("forging.status.chainSaved");
});
refreshMaterialsButton?.addEventListener("click", () => {
  void syncBackpackMaterials({ force: true });
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !toolSettingsMenu.hidden) {
    hideToolSettingsMenu();
    return;
  }
  if (event.key === "Escape" && forgeContextMenu && !forgeContextMenu.hidden) {
    hideForgeContextMenu();
    return;
  }
  if (event.key === "Escape" && draftContextMenu && !draftContextMenu.hidden) {
    hideDraftContextMenu();
    return;
  }
  if (event.key === "Escape" && chainModal.classList.contains("open")) {
    closeChainCodeModal();
    return;
  }
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
  if (event.key === "Delete" || event.key === "Backspace") {
    if (!selectedPiece) return;
    event.preventDefault();
    removeSelectedPiece();
    return;
  }
  const tool = tools.find((item) => item.hotkey === event.key);
  if (!tool || tool.disabled) return;
  event.preventDefault();
  selectTool(tool.id);
});

canvas.addEventListener("dragover", (event) => {
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
});

canvas.addEventListener("drop", (event) => {
  event.preventDefault();
  addDroppedMaterial(event.dataTransfer.getData("text/plain"));
});

canvas.addEventListener("pointerdown", (event) => {
  const touch = isTouchPointer(event);
  updatePointer(event);
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
  canvas.setPointerCapture(event.pointerId);

  if (touch) {
    activeTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activeTouchPointers.size >= 2) {
      event.preventDefault();
      beginPinchGesture();
      activeDrag = null;
      finishShapeToolAction();
      rotatingCamera = false;
      cameraPointerId = null;
      leftPointerDown = false;
      return;
    }
  }

  if (event.button === 1) {
    event.preventDefault();
    rotatingCamera = true;
    cameraPointerId = event.pointerId;
    return;
  }

  if (event.button !== 0) return;
  leftPointerDown = true;
  leftPointerMoved = false;

  if (sawEnabled || drillEnabled) {
    toolAction = beginShapeToolAction();
    if (toolAction) return;
    if (touch) {
      rotatingCamera = true;
      cameraPointerId = event.pointerId;
      return;
    }
  }

  if (moveEnabled) {
    activeDrag = createMoveDrag(event, { allowPlaneDrag: !touch });
    if (activeDrag) return;
  }

  if (touch) {
    rotatingCamera = true;
    cameraPointerId = event.pointerId;
  }
});

canvas.addEventListener("pointermove", (event) => {
  if (isTouchPointer(event) && activeTouchPointers.has(event.pointerId)) {
    activeTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinchGesture && activeTouchPointers.size >= 2) {
      updatePinchGesture();
      return;
    }
  }

  updatePointer(event);
  updateHoveredFace();

  const dx = event.clientX - lastPointerX;
  const dy = event.clientY - lastPointerY;

  if (activeDrag) {
    if (activeDrag.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - activeDrag.startX, event.clientY - activeDrag.startY) > 3) leftPointerMoved = true;
    updateMoveDrag(event);
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    return;
  }

  if (rotatingCamera && cameraPointerId === event.pointerId) {
    rotateCameraBy(dx, dy);
  } else if (leftPointerDown && Math.hypot(event.clientX - lastPointerX, event.clientY - lastPointerY) > 3) {
    leftPointerMoved = true;
  }

  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
});

canvas.addEventListener("pointerup", (event) => {
  canvas.releasePointerCapture(event.pointerId);
  if (isTouchPointer(event)) {
    activeTouchPointers.delete(event.pointerId);
    if (pinchGesture) {
      endPinchGesture();
      return;
    }
  }

  updatePointer(event);
  if (event.button === 1) {
    rotatingCamera = false;
    cameraPointerId = null;
    return;
  }

  if (event.button !== 0) return;

  const wasDragging = Boolean(activeDrag);
  const wasRotating = rotatingCamera && cameraPointerId === event.pointerId;
  activeDrag = null;
  finishShapeToolAction();
  saw.visible = false;
  handDrill.visible = false;
  leftPointerDown = false;
  if (wasRotating) {
    rotatingCamera = false;
    cameraPointerId = null;
  }
  updateMoveGizmo();

  if (!wasDragging && !wasRotating && !leftPointerMoved && gripEnabled) {
    setGripFromPointer();
    return;
  }
  if (!wasDragging && !wasRotating && !leftPointerMoved && hammerEnabled) hammerHit();
});

canvas.addEventListener("pointercancel", (event) => {
  activeTouchPointers.delete(event.pointerId);
  if (pinchGesture) endPinchGesture();
  if (cameraPointerId === event.pointerId) {
    rotatingCamera = false;
    cameraPointerId = null;
  }
  if (activeDrag?.pointerId === event.pointerId) activeDrag = null;
  finishShapeToolAction();
  leftPointerDown = false;
});

canvas.addEventListener("auxclick", (event) => {
  if (event.button === 1) event.preventDefault();
});

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  updatePointer(event);
  if (moveEnabled) {
    const target = toolTargetFromPointer({ allowSelectedFallback: false });
    if (target?.piece) selectPiece(target.piece);
    if (selectedPiece) showForgeContextMenu(event.clientX, event.clientY);
    else hideForgeContextMenu();
    hideToolSettingsMenu();
  } else if (gripEnabled) {
    hideForgeContextMenu();
    rotateGripGesture();
    hideToolSettingsMenu();
    updateHoveredFace();
  } else if (sawEnabled) {
    hideForgeContextMenu();
    rotateSawAngle();
    hideToolSettingsMenu();
    updateHoveredFace();
  } else if (drillEnabled) {
    hideForgeContextMenu();
    showToolSettingsMenu(event.clientX, event.clientY);
    updateHoveredFace();
  } else {
    hideForgeContextMenu();
    hideToolSettingsMenu();
  }
});

document.addEventListener("pointerdown", (event) => {
  if (forgeContextMenu && !forgeContextMenu.hidden && !forgeContextMenu.contains(event.target)) hideForgeContextMenu();
  if (draftContextMenu && !draftContextMenu.hidden && !draftContextMenu.contains(event.target)) hideDraftContextMenu();
  if (!toolSettingsMenu.hidden && !toolSettingsMenu.contains(event.target)) hideToolSettingsMenu();
});

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  distance = THREE.MathUtils.clamp(distance + event.deltaY * 0.01, 5.5, 15);
  updateCamera();
}, { passive: false });

function isTouchPointer(event) {
  return event.pointerType === "touch";
}

function rotateCameraBy(dx, dy) {
  yaw -= dx * 0.008;
  pitch = THREE.MathUtils.clamp(pitch + dy * 0.005, -0.15, 1.08);
  updateCamera();
}

function beginPinchGesture() {
  const points = Array.from(activeTouchPointers.values());
  if (points.length < 2) return;
  pinchGesture = {
    startDistance: pointerDistance(points[0], points[1]),
    startCameraDistance: distance,
  };
}

function updatePinchGesture() {
  if (!pinchGesture) return;
  const points = Array.from(activeTouchPointers.values());
  if (points.length < 2) {
    endPinchGesture();
    return;
  }
  const nextDistance = pointerDistance(points[0], points[1]);
  if (pinchGesture.startDistance <= 0) return;
  distance = THREE.MathUtils.clamp(pinchGesture.startCameraDistance * (pinchGesture.startDistance / nextDistance), 5.5, 15);
  updateCamera();
}

function endPinchGesture() {
  pinchGesture = null;
  rotatingCamera = false;
  cameraPointerId = null;
  activeDrag = null;
  finishShapeToolAction();
  leftPointerDown = false;
  leftPointerMoved = true;
}

function pointerDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cursorForTool(toolId) {
  if (toolId === "gloves") return "grab";
  return toolCursorUrls[toolId] ? `url("${toolCursorUrls[toolId]}") 8 8, crosshair` : "crosshair";
}

function toolCursorUrl(toolId) {
  const svg = toolCursorSvg(toolId);
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function toolCursorSvg(toolId) {
  const common = "stroke='#10140f' stroke-width='2' stroke-linejoin='round' stroke-linecap='round'";
  if (toolId === "hammer") {
    return `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><path ${common} fill='#8d9390' d='M8 5h17v7H8z'/><path ${common} fill='#6b3f25' d='M15 11h5v18h-5z'/><path fill='#f0cf4f' d='M5 5h4v7H5z'/></svg>`;
  }
  if (toolId === "saw") {
    return `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><path ${common} fill='#c8d0c9' d='M6 8h21v7H6z'/><path ${common} fill='#6b3f25' d='M4 14h8v8H4z'/><path fill='#10140f' d='M9 15l2 4 2-4 2 4 2-4 2 4 2-4 2 4 2-4z'/></svg>`;
  }
  if (toolId === "handDrill") {
    return `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><path ${common} fill='#b8c0bd' d='M7 13h17l5 3-5 3H7z'/><path ${common} fill='#6b3f25' d='M5 10h7v12H5z'/><path ${common} fill='none' d='M9 22v6h7'/></svg>`;
  }
  if (toolId === "grip") {
    return `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><path ${common} fill='#c99061' d='M8 12h5v13H8zM14 8h4v17h-4zM19 9h4v16h-4zM24 13h4v11h-4z'/><path ${common} fill='#b2774f' d='M7 21h19v7H9z'/></svg>`;
  }
  if (toolId === "axe") {
    return `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><path ${common} fill='#6b3f25' d='M14 8h5v21h-5z'/><path ${common} fill='#9ea6a8' d='M11 5h12l5 6-5 6H11z'/></svg>`;
  }
  if (toolId === "sprayGun") {
    return `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><path ${common} fill='#9ea6a8' d='M5 11h17v7H5z'/><path ${common} fill='#6b3f25' d='M10 18h7l-2 10h-5z'/><path fill='#f0cf4f' d='M24 11h5v2h-5zM24 16h4v2h-4z'/></svg>`;
  }
  return `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><path ${common} fill='#8a5a35' d='M9 8h6v18H9zM17 6h6v20h-6z'/></svg>`;
}

function createBox(width, height, depth, color, options = {}) {
  return new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), options.material ?? new THREE.MeshLambertMaterial({ color }));
}

function createFlame(height, color) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
  });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.18, height, 6), material);
  flame.position.y = height * 0.5;
  flame.rotation.y = height;
  flame.renderOrder = 2;
  return flame;
}

function createHammer() {
  const group = new THREE.Group();
  const head = createBox(0.92, 0.28, 0.36, 0x8d9390);
  const handle = createBox(0.16, 1.28, 0.16, 0x5a3724);
  handle.position.set(0, 0.64, 0);
  head.position.set(0, 1.34, 0);
  group.userData.strikePoint = new THREE.Vector3(0.46, 1.34, 0);
  group.add(handle, head);
  group.traverse((child) => {
    if (!child.isMesh) return;
    child.renderOrder = 10;
    child.material.depthTest = false;
  });
  return group;
}

function createSaw() {
  const group = new THREE.Group();
  const blade = createBox(1.08, 0.08, 0.2, 0xc8d0c9);
  const teeth = createBox(1.02, 0.05, 0.06, 0x8f9893);
  const handle = createBox(0.28, 0.18, 0.32, 0x6b3f25);
  blade.position.set(0, 0, 0);
  teeth.position.set(0, -0.07, 0.07);
  handle.position.set(-0.64, 0.02, 0);
  group.add(blade, teeth, handle);
  group.traverse((child) => {
    if (!child.isMesh) return;
    child.renderOrder = 10;
    child.material.depthTest = false;
  });
  return group;
}

function createHandDrill() {
  const group = new THREE.Group();
  const bit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.08, 0.72, 14).rotateZ(Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0xb8c0bd }),
  );
  const body = createBox(0.34, 0.22, 0.22, 0x6b3f25);
  const grip = createBox(0.12, 0.54, 0.12, 0x5a3724);
  bit.position.set(0.3, 0, 0);
  body.position.set(-0.1, 0, 0);
  grip.position.set(-0.24, -0.35, 0);
  group.add(bit, body, grip);
  group.userData.bit = bit;
  group.traverse((child) => {
    if (!child.isMesh) return;
    child.renderOrder = 10;
    child.material.depthTest = false;
  });
  return group;
}

function createGripHand() {
  const group = new THREE.Group();
  group.name = "gripHand";
  group.userData.ignoreAvatarCollision = true;
  const handMaterial = new THREE.MeshBasicMaterial({
    color: 0x40ff88,
    transparent: true,
    opacity: 0.42,
    depthTest: false,
  });
  const jointMaterial = new THREE.MeshBasicMaterial({
    color: 0x1f9d54,
    transparent: true,
    opacity: 0.55,
    depthTest: false,
  });

  const addHandPart = (name, size, position, material = handMaterial, rotation = null) => {
    const part = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
    part.name = name;
    part.userData.ignoreAvatarCollision = true;
    part.position.copy(position);
    if (rotation) part.rotation.set(rotation.x, rotation.y, rotation.z);
    group.add(part);
    return part;
  };

  const palmDepth = 0.045;
  const rail = 0.035;
  addHandPart("palmKnuckleRail", new THREE.Vector3(avatarHandGripSize.x, rail, palmDepth), new THREE.Vector3(0, 0.16, 0));
  addHandPart("palmWristRail", new THREE.Vector3(avatarHandGripSize.x * 0.74, rail, palmDepth), new THREE.Vector3(0.015, -0.16, 0));
  addHandPart("palmThumbRail", new THREE.Vector3(rail, avatarHandGripSize.y * 0.68, palmDepth), new THREE.Vector3(-0.155, -0.005, 0));
  addHandPart("palmOuterRail", new THREE.Vector3(rail, avatarHandGripSize.y * 0.62, palmDepth), new THREE.Vector3(0.155, 0.01, 0));
  addHandPart("wrist", new THREE.Vector3(0.18, 0.08, palmDepth), new THREE.Vector3(0.02, -0.245, 0), jointMaterial);

  for (let index = 0; index < 4; index++) {
    const x = -0.12 + index * 0.08;
    const length = index === 0 || index === 3 ? 0.16 : 0.19;
    addHandPart(`finger${index}Base`, new THREE.Vector3(0.045, length, 0.05), new THREE.Vector3(x, 0.255, -0.018), jointMaterial);
    addHandPart(`finger${index}Tip`, new THREE.Vector3(0.04, length * 0.72, 0.045), new THREE.Vector3(x, 0.255 + length * 0.58, -0.03), handMaterial);
    addHandPart(`finger${index}Pad`, new THREE.Vector3(0.048, 0.028, 0.052), new THREE.Vector3(x, 0.255 + length * 0.98, -0.054), handMaterial);
  }

  addHandPart(
    "thumbBase",
    new THREE.Vector3(0.055, 0.16, 0.05),
    new THREE.Vector3(-0.205, -0.035, -0.02),
    jointMaterial,
    new THREE.Vector3(0, 0, -0.72),
  );
  addHandPart(
    "thumbTip",
    new THREE.Vector3(0.052, 0.14, 0.048),
    new THREE.Vector3(-0.25, 0.06, -0.04),
    handMaterial,
    new THREE.Vector3(0, 0, -0.36),
  );

  group.renderOrder = 12;
  group.traverse((child) => {
    if (!child.isMesh) return;
    child.renderOrder = 12;
  });
  return group;
}

function createMoveGizmo() {
  const group = new THREE.Group();
  group.add(createAxisHandle("x", 0xd94a4a));
  group.add(createAxisHandle("y", 0xf0cf4f));
  group.add(createAxisHandle("z", 0x5d8ee8));
  return group;
}

function createAxisHandle(axis, color) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color, depthTest: false });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 10), material);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.26, 14), material);
  shaft.position.y = 0.55;
  head.position.y = 1.22;
  shaft.userData.axis = axis;
  head.userData.axis = axis;
  shaft.renderOrder = 4;
  head.renderOrder = 4;
  const label = createAxisLabel(axis, color);
  group.add(shaft, head, label);

  if (axis === "x") group.rotation.z = -Math.PI / 2;
  if (axis === "z") group.rotation.x = Math.PI / 2;
  return group;
}

function createAxisLabel(axis, color) {
  const label = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createTextTexture(t(axisLabelKeys[axis]), color),
    depthTest: false,
    transparent: true,
  }));
  label.position.y = 1.54;
  label.scale.set(0.54, 0.22, 1);
  label.renderOrder = 6;
  label.userData.labelKey = axisLabelKeys[axis];
  label.userData.labelColor = color;
  return label;
}

function updateAxisLabels() {
  moveGizmo.traverse((child) => {
    if (!child.userData.labelKey || !child.material?.map) return;
    const previous = child.material.map;
    child.material.map = createTextTexture(t(child.userData.labelKey), child.userData.labelColor);
    child.material.needsUpdate = true;
    previous.dispose();
  });
}

function createTextTexture(text, color) {
  const canvasElement = document.createElement("canvas");
  canvasElement.width = 256;
  canvasElement.height = 96;
  const context = canvasElement.getContext("2d");
  context.clearRect(0, 0, canvasElement.width, canvasElement.height);
  context.font = "700 38px Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.lineWidth = 10;
  context.strokeStyle = "rgba(8, 10, 8, 0.84)";
  context.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  context.strokeText(text, 128, 48);
  context.fillText(text, 128, 48);
  const texture = new THREE.CanvasTexture(canvasElement);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

async function syncBackpackMaterials({ force = false } = {}) {
  if (backpackMaterialStatus === "syncing" && !force) return;
  backpackMaterialStatus = "syncing";
  renderBackpackMaterials();
  try {
    const status = await getEquippedBackpackStatus();
    if (!status?.equipped || !status.backpack) {
      backpackMaterialEntries = [];
      backpackMaterialStatus = "no-backpack";
      renderBackpackMaterials();
      return;
    }
    backpackMaterialEntries = collectBackpackMaterialEntries(status.backpack);
    backpackMaterialStatus = backpackMaterialEntries.length ? "ready" : "empty";
    renderBackpackMaterials();
    setStatus("forging.status.materialsSynced");
  } catch (error) {
    console.warn("Failed to load forging backpack materials", error);
    backpackMaterialEntries = [];
    backpackMaterialStatus = "error";
    renderBackpackMaterials();
    setStatus("forging.status.materialLoadFailed");
  }
}

function collectBackpackMaterialEntries(backpack) {
  const entries = [];
  for (const [slotIndex, slot] of (backpack?.slots ?? []).entries()) {
    if (slot?.kind !== "item") continue;
    const materialId = smeltingMaterialIdForItemCode(slot.itemCode) ?? smeltingMaterialIdForItemCode(slot.itemId);
    const material = smeltingMaterialById(materialId);
    if (!material) continue;
    entries.push({
      key: backpackMaterialEntryKey(slot, slotIndex),
      id: materialId,
      material,
      quantity: Math.max(1, Number(slot.quantity) || 1),
      volumeMm3: Math.max(0, Number(slot.volumeMm3) || 0),
      slot,
      slotIndex,
    });
  }
  return entries;
}

function backpackMaterialEntryKey(slot, slotIndex) {
  return [
    slotIndex,
    slot?.itemPda || "",
    slot?.itemId || "",
    slot?.itemCode ?? "",
    slot?.volumeMm3 ?? "",
    slot?.flags ?? "",
    slot?.quantity ?? "",
  ].join(":");
}

function backpackMaterialEntryByKey(key) {
  return backpackMaterialEntries.find((entry) => entry.key === key) ?? null;
}

function renderBackpackMaterials() {
  if (!resourceGrid) return;
  if (backpackMaterialStatus === "syncing") {
    resourceGrid.replaceChildren(createMaterialStateCard("loading", "forging.materialSyncing", "forging.materialSyncingDetail"));
    return;
  }
  if (backpackMaterialStatus === "no-backpack") {
    resourceGrid.replaceChildren(createMaterialStateCard("empty", "forging.materialNoBackpack", "forging.materialNoBackpackDetail"));
    return;
  }
  if (backpackMaterialStatus === "error") {
    resourceGrid.replaceChildren(createMaterialStateCard("error", "forging.materialLoadFailed", "forging.materialLoadFailedDetail"));
    return;
  }
  if (!backpackMaterialEntries.length) {
    resourceGrid.replaceChildren(createMaterialStateCard("empty", "forging.materialEmpty", "forging.materialEmptyDetail"));
    return;
  }
  resourceGrid.replaceChildren(...backpackMaterialEntries.map(createMaterialCard));
}

function createMaterialStateCard(kind, titleKey, detailKey) {
  const card = document.createElement("div");
  card.className = `resource-card ${kind}`;
  const title = document.createElement("strong");
  title.textContent = t(titleKey);
  const detail = document.createElement("span");
  detail.textContent = t(detailKey);
  card.append(title, detail);
  return card;
}

function createMaterialCard(entry) {
  const profile = materialForgeProfile(entry.id);
  const used = usedBackpackMaterialEntryKeys.has(entry.key);
  const card = document.createElement("button");
  card.className = "resource-card";
  card.type = "button";
  card.draggable = !used;
  card.disabled = used;
  card.classList.toggle("used", used);
  card.dataset.material = entry.id;
  card.dataset.materialEntry = entry.key;
  card.setAttribute("aria-disabled", String(used));

  const swatch = document.createElement("span");
  swatch.className = "resource-swatch resource-preview-swatch";
  swatch.setAttribute("aria-hidden", "true");
  swatch.append(createResourceMaterialPreviewCanvas(entry.material, {
    className: "resource-swatch-canvas",
    size: 48,
  }));

  const title = document.createElement("strong");
  title.textContent = materialDisplayName(entry.id);

  const detail = document.createElement("span");
  const fuel = smeltingFuelForMaterialId(entry.id);
  detail.textContent = fuel
    ? t("forging.materialFuelDetail", { tier: fuel.heatTier, count: entry.quantity })
    : t("forging.materialCardDetail", { type: materialUseLabel(entry.material), count: entry.quantity });

  card.append(swatch, title, detail);
  card.addEventListener("dragstart", (event) => {
    if (usedBackpackMaterialEntryKeys.has(entry.key)) {
      event.preventDefault();
      return;
    }
    card.classList.add("dragging");
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", `material-entry:${entry.key}`);
    setStatus("forging.status.dropReady");
  });
  card.addEventListener("dragend", () => card.classList.remove("dragging"));
  card.addEventListener("click", () => addBackpackMaterialEntry(entry));
  return card;
}

function addDroppedMaterial(payload) {
  const value = String(payload || "");
  if (value.startsWith("material-entry:")) {
    const entry = backpackMaterialEntryByKey(value.slice("material-entry:".length));
    if (entry) addBackpackMaterialEntry(entry);
    return;
  }
  if (value.startsWith("material:")) {
    addBackpackMaterial(value.slice("material:".length));
    return;
  }
  addResource(value);
}

function addBackpackMaterial(materialId) {
  const entry = backpackMaterialEntries.find((item) => item.id === materialId);
  if (entry) {
    addBackpackMaterialEntry(entry);
    return;
  }
  const profile = materialForgeProfile(materialId);
  if (!profile) return;
  addResource(profile.resourceId, profile);
}

function addBackpackMaterialEntry(entry) {
  if (!entry?.key || usedBackpackMaterialEntryKeys.has(entry.key)) return;
  const profile = materialForgeProfile(entry?.id, entry);
  if (!profile) return;
  addResource(profile.resourceId, profile);
}

function addResource(resourceId, materialProfile = null) {
  const resource = materialProfile ?? resources[resourceId];
  if (!resource) return;

  if (resource.fuel) {
    if (selectedPiece) selectedPiece.heat = Math.min(100, selectedPiece.heat + resource.heat);
    if (materialProfile?.entryKey) {
      usedBackpackMaterialEntryKeys.add(materialProfile.entryKey);
      renderBackpackMaterials();
    }
    setStatus("forging.status.heatAdded");
    updateHud();
    return;
  }

  const piece = createPiece(resourceId, materialProfile);
  const position = findOpenPlacement(piece);
  if (!position) {
    setStatus("forging.status.miss");
    disposePiece(piece);
    return;
  }

  if (materialProfile?.entryKey) piece.backpackMaterialEntryKey = materialProfile.entryKey;
  piece.offset.copy(position);
  pieces.push(piece);
  selectableMeshes.push(piece.mesh);
  scene.add(piece.mesh, piece.edges);
  if (piece.backpackMaterialEntryKey) {
    usedBackpackMaterialEntryKeys.add(piece.backpackMaterialEntryKey);
    renderBackpackMaterials();
  }
  selectPiece(piece);
  setStatus("forging.status.resourceAdded");
  updatePiece(piece);
  updateHud();
}

function syncUsedBackpackMaterialEntriesFromWorkbench() {
  usedBackpackMaterialEntryKeys.clear();
  for (const piece of pieces) {
    for (const key of backpackMaterialEntryKeysForPiece(piece)) usedBackpackMaterialEntryKeys.add(key);
  }
  renderBackpackMaterials();
}

function backpackMaterialEntryKeysForPiece(piece) {
  const keys = [];
  if (piece?.backpackMaterialEntryKey) keys.push(piece.backpackMaterialEntryKey);
  for (const key of piece?.backpackMaterialEntryKeys ?? []) if (key) keys.push(key);
  for (const component of piece?.components ?? []) {
    if (component.backpackMaterialEntryKey) keys.push(component.backpackMaterialEntryKey);
    for (const key of component.backpackMaterialEntryKeys ?? []) if (key) keys.push(key);
  }
  return [...new Set(keys)];
}

function createPiece(resourceId, materialProfile = null) {
  const resource = materialProfile ?? resources[resourceId];
  const material = workMaterial.clone();
  material.color.set(resource.color);
  const mesh = new THREE.Mesh(emptyGeometry.clone(), material);
  const edges = new THREE.LineSegments(
    emptyGeometry.clone(),
    new THREE.LineBasicMaterial({ color: 0xffe0a1, transparent: true, opacity: 0.55 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.pieceId = nextPieceId;
  edges.userData.pieceId = nextPieceId;

  const piece = {
    id: nextPieceId++,
    resourceId,
    materialIds: [materialProfile?.materialId ?? resourceId],
    role: resource.role,
    color: new THREE.Color(resource.color),
    heat: resource.heat,
    mass: 0,
    baseMass: 0,
    densityKgM3: materialProfile?.densityKgM3 ?? resource.densityKgM3 ?? materialDensityKgM3(),
    hardness: resource.hardness,
    backpackMaterialEntryKey: materialProfile?.entryKey ?? null,
    dims: new THREE.Vector3(...resource.dims),
    offset: new THREE.Vector3(0, 0, 0),
    grid: { ...voxelGrid },
    solid: createSolidVoxels(voxelGrid),
    mesh,
    edges,
  };
  piece.baseMass = componentFullMassKg(piece);
  piece.mass = componentMassKg(piece);
  refreshPieceGeometry(piece);
  return piece;
}

function applyMaterialProfileToPiece(piece, materialProfile = null) {
  if (!piece || !materialProfile) return;
  piece.materialIds = [materialProfile.materialId];
  piece.role = materialProfile.role;
  piece.color = new THREE.Color(materialProfile.color);
  piece.heat = materialProfile.heat;
  piece.densityKgM3 = materialProfile.densityKgM3;
  piece.hardness = materialProfile.hardness;
  piece.dims = new THREE.Vector3(...materialProfile.dims);
  piece.baseMass = componentFullMassKg(piece);
  piece.mass = componentMassKg(piece);
  piece.mesh.material.color.set(materialProfile.color);
}

function materialForgeProfile(materialId, entry = null) {
  const material = smeltingMaterialById(materialId);
  if (!material) return null;
  const attributes = smeltingMaterialBaseAttributes(material);
  const fuel = smeltingFuelForMaterialId(materialId);
  const resourceId = fuel ? "coal" : forgeResourceIdForMaterial(material);
  const base = resources[resourceId] ?? resources.iron;
  return {
    ...base,
    materialId,
    entryKey: entry?.key ?? null,
    slotIndex: Number.isInteger(entry?.slotIndex) ? entry.slotIndex : null,
    resourceId,
    color: smeltingMaterialColor(material),
    fuel: Boolean(fuel),
    heat: fuel ? Math.max(base.heat, fuel.heatTier * 18) : Math.max(6, material.requiredHeatTier * 9 + Math.round((attributes.heatResistance ?? 0) / 8)),
    mass: materialMassForForgeUse(entry?.volumeMm3, attributes),
    densityKgM3: materialDensityKgM3(attributes),
    hardness: Math.max(0.12, Math.min(0.98, (attributes.hardness ?? 50) / 100)),
    dims: materialDimsForForgeUse(entry?.volumeMm3),
    role: materialRoleForForgeUse(material.forgeUse, base.role),
  };
}

function forgeResourceIdForMaterial(material) {
  if (["binding", "soilCatalyst"].includes(material.forgeUse) || ["fiber", "polymer"].includes(material.class)) return "handle";
  if (["conductor", "circuit", "cooling", "lens"].includes(material.forgeUse)) return "copper";
  if (["mold", "flux", "masonry", "sealedVessel"].includes(material.forgeUse) || ["ceramic", "glass", "stone"].includes(material.class)) return "tin";
  return "iron";
}

function materialRoleForForgeUse(forgeUse, fallback = null) {
  if (forgeUse === "binding") return "grip";
  return fallback;
}

function materialDimsForForgeUse(volumeMm3 = 0) {
  const volume = Number(volumeMm3) > 0 ? Number(volumeMm3) : defaultResourceVolumeMm3;
  const sideMeters = Math.cbrt(volume * 1e-9);
  const side = metersToForgeSceneUnits(sideMeters);
  return [side, side, side].map((value) => Number(value.toFixed(4)));
}

function materialMassForForgeUse(volumeMm3 = 0, attributes = {}) {
  const volume = Number(volumeMm3) > 0 ? Number(volumeMm3) : defaultResourceVolumeMm3;
  const densityKgM3 = materialDensityKgM3(attributes);
  return Number((volume * 1e-9 * densityKgM3).toFixed(3));
}

function materialDensityKgM3(attributes = {}) {
  return Math.max(50, (Number(attributes.density) || 45) * 100);
}

function materialDensityForIds(materialIds = [], resourceId = "iron") {
  for (const materialId of materialIds ?? []) {
    const material = smeltingMaterialById(materialId);
    if (!material) continue;
    return materialDensityKgM3(smeltingMaterialBaseAttributes(material));
  }
  return resources[resourceId]?.densityKgM3 ?? materialDensityKgM3();
}

function componentSolidCount(component) {
  let solidCount = 0;
  for (const value of component?.solid ?? []) if (value) solidCount++;
  return solidCount;
}

function componentFullVolumeM3(component) {
  if (!component?.dims) return 0;
  return Math.max(0, component.dims.x * component.dims.y * component.dims.z * forgeMetersPerSceneUnit ** 3);
}

function componentSolidVolumeM3(component) {
  if (!component?.solid?.length) return 0;
  return componentFullVolumeM3(component) * (componentSolidCount(component) / component.solid.length);
}

function componentMassKg(component) {
  const densityKgM3 = component?.densityKgM3 ?? materialDensityForIds(component?.materialIds, component?.resourceId);
  return roundPhysicalValue(componentSolidVolumeM3(component) * densityKgM3, 4);
}

function componentFullMassKg(component) {
  const densityKgM3 = component?.densityKgM3 ?? materialDensityForIds(component?.materialIds, component?.resourceId);
  return roundPhysicalValue(componentFullVolumeM3(component) * densityKgM3, 4);
}

function weightedDensityForComponents(components = []) {
  let totalMass = 0;
  let totalVolume = 0;
  for (const component of components) {
    totalMass += componentMassKg(component);
    totalVolume += componentSolidVolumeM3(component);
  }
  return totalVolume > 0 ? roundPhysicalValue(totalMass / totalVolume, 2) : materialDensityKgM3();
}

function pieceSolidVolumeM3(piece) {
  if (!piece) return 0;
  if (piece.components) return piece.components.reduce((sum, component) => sum + componentSolidVolumeM3(component), 0);
  return componentSolidVolumeM3(piece);
}

function pieceWeightedDensityKgM3(piece) {
  const volume = pieceSolidVolumeM3(piece);
  return volume > 0 ? roundPhysicalValue((piece?.mass ?? 0) / volume, 2) : piece?.densityKgM3 ?? materialDensityForIds(piece?.materialIds, piece?.resourceId);
}

function roundPhysicalValue(value, decimals = 3) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function formatMassKg(value) {
  const mass = Number(value) || 0;
  if (mass > 0 && mass < 0.001) return "<0.001 kg";
  if (mass < 1) return `${mass.toFixed(3)} kg`;
  if (mass < 10) return `${mass.toFixed(2)} kg`;
  return `${mass.toFixed(1)} kg`;
}

function formatVolumeLiters(valueM3) {
  const liters = (Number(valueM3) || 0) * 1000;
  if (liters > 0 && liters < 0.001) return "<0.001 L";
  if (liters < 1) return `${liters.toFixed(3)} L`;
  if (liters < 10) return `${liters.toFixed(2)} L`;
  return `${liters.toFixed(1)} L`;
}

function formatDensityKgM3(value) {
  const density = Number(value) || 0;
  return `${Math.round(density).toLocaleString()} kg/m3`;
}

function metersToForgeSceneUnits(value) {
  return value / forgeMetersPerSceneUnit;
}

function smeltingMaterialColor(material) {
  if (!material) return 0x8bd8ff;
  return new THREE.Color(resourceMaterialColors(material)[0]).getHex() || smeltingClassColors[material.class] || 0x8bd8ff;
}

function materialDisplayName(materialId) {
  const key = `resourceAtlas.material.item.${materialId}.name`;
  const label = t(key);
  return label === key ? humanizeId(materialId) : label;
}

function materialUseLabel(material) {
  return humanizeId(material?.forgeUse || material?.class || "material");
}

function humanizeId(id) {
  return String(id || "material")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function createPieceFromComponent(component) {
  const resourceId = component.resourceId ?? "iron";
  const resource = resources[resourceId] ?? resources.iron;
  const material = workMaterial.clone();
  material.color.set(resource.color);
  const mesh = new THREE.Mesh(emptyGeometry.clone(), material);
  const edges = new THREE.LineSegments(
    emptyGeometry.clone(),
    new THREE.LineBasicMaterial({ color: 0xffe0a1, transparent: true, opacity: 0.55 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.pieceId = nextPieceId;
  edges.userData.pieceId = nextPieceId;

  const piece = {
    id: nextPieceId++,
    resourceId,
    materialIds: [...(component.materialIds?.length ? component.materialIds : [resourceId])],
    role: component.role ?? resource.role,
    color: new THREE.Color(resource.color),
    heat: resource.heat,
    mass: 0,
    baseMass: 0,
    densityKgM3: component.densityKgM3 ?? materialDensityForIds(component.materialIds, resourceId),
    hardness: resource.hardness,
    dims: component.dims.clone(),
    offset: component.offset.clone(),
    grid: { ...component.grid },
    solid: new Uint8Array(component.solid),
    gripOffset: component.gripOffset?.clone?.().sub(component.offset) ?? null,
    mesh,
    edges,
  };
  piece.baseMass = componentFullMassKg(piece);
  piece.mass = componentMassKg(piece);
  refreshPieceGeometry(piece);
  return piece;
}

function createPieceFromAppearance(appearance) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.68, metalness: 0.45 });
  const mesh = new THREE.Mesh(emptyGeometry.clone(), material);
  const edges = new THREE.LineSegments(
    emptyGeometry.clone(),
    new THREE.LineBasicMaterial({ color: 0xffe0a1, transparent: true, opacity: 0.65 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.pieceId = nextPieceId;
  edges.userData.pieceId = nextPieceId;

  const piece = {
    id: nextPieceId++,
    resourceId: "iron",
    materialIds: [...new Set((appearance.quads ?? []).map((quad) => quad.resourceId).filter((id) => resources[id]))],
    color: new THREE.Color(0xffffff),
    heat: 0,
    mass: 0,
    baseMass: 0,
    densityKgM3: resources.iron.densityKgM3,
    hardness: 0.5,
    dims: appearance.dims.clone(),
    offset: new THREE.Vector3(),
    appearance,
    grid: { ...appearanceGrid },
    solid: createSolidVoxels(appearanceGrid),
    gripOffset: appearance.gripOffset?.clone?.() ?? null,
    gripNormal: appearance.gripNormal?.clone?.() ?? null,
    gripAngle: appearance.gripAngle ?? 0,
    mesh,
    edges,
  };
  if (!piece.materialIds.length) piece.materialIds.push("iron");
  refreshPieceGeometry(piece);
  return piece;
}

function createPieceFromDraft(snapshot) {
  const resourceId = snapshot.resourceId ?? "iron";
  const resource = resources[resourceId] ?? resources.iron;
  const isCompound = Array.isArray(snapshot.components);
  const isAppearance = snapshot.appearance && Array.isArray(snapshot.appearance.quads);
  const material = isCompound || isAppearance
    ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.68, metalness: 0.45 })
    : workMaterial.clone();
  if (!isCompound && !isAppearance) material.color.set(snapshot.color ?? resource.color);
  const mesh = new THREE.Mesh(emptyGeometry.clone(), material);
  const edges = new THREE.LineSegments(
    emptyGeometry.clone(),
    new THREE.LineBasicMaterial({ color: 0xffe0a1, transparent: true, opacity: isCompound || isAppearance ? 0.65 : 0.55 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.pieceId = nextPieceId;
  edges.userData.pieceId = nextPieceId;

  const piece = {
    id: nextPieceId++,
    resourceId,
    materialIds: Array.isArray(snapshot.materialIds) ? snapshot.materialIds.filter(Boolean) : [resourceId],
    backpackMaterialEntryKey: typeof snapshot.backpackMaterialEntryKey === "string" ? snapshot.backpackMaterialEntryKey : null,
    backpackMaterialEntryKeys: Array.isArray(snapshot.backpackMaterialEntryKeys) ? snapshot.backpackMaterialEntryKeys.filter(Boolean) : [],
    role: snapshot.role ?? resource.role,
    color: new THREE.Color(snapshot.color ?? resource.color),
    heat: finiteNumber(snapshot.heat, resource.heat),
    mass: finiteNumber(snapshot.mass, resource.mass),
    baseMass: finiteNumber(snapshot.baseMass, resource.mass),
    densityKgM3: finiteNumber(snapshot.densityKgM3, materialDensityForIds(snapshot.materialIds, resourceId)),
    hardness: finiteNumber(snapshot.hardness, resource.hardness),
    dims: vectorFromArray(snapshot.dims, new THREE.Vector3(...(resource.dims ?? [1, 1, 1]))),
    offset: vectorFromArray(snapshot.offset, new THREE.Vector3()),
    mesh,
    edges,
  };

  if (isAppearance) {
    piece.appearance = deserializeDraftAppearance(snapshot.appearance);
    const grid = validGrid(snapshot.grid) ? snapshot.grid : { ...appearanceGrid };
    piece.grid = { ...grid };
    piece.solid = uint8FromArray(snapshot.solid, grid.x * grid.y * grid.z);
    piece.gripOffset = snapshot.gripOffset ? vectorFromArray(snapshot.gripOffset, null) : piece.appearance.gripOffset?.clone?.() ?? null;
    piece.gripNormal = snapshot.gripNormal ? vectorFromArray(snapshot.gripNormal, null) : piece.appearance.gripNormal?.clone?.() ?? null;
    piece.gripAngle = finiteNumber(snapshot.gripAngle, piece.appearance.gripAngle ?? 0);
  } else if (isCompound) {
    piece.components = snapshot.components.map(deserializeDraftComponent);
  } else {
    const grid = validGrid(snapshot.grid) ? snapshot.grid : { ...voxelGrid };
    piece.grid = { ...grid };
    piece.solid = uint8FromArray(snapshot.solid, grid.x * grid.y * grid.z);
    piece.gripOffset = snapshot.gripOffset ? vectorFromArray(snapshot.gripOffset, null) : null;
    piece.gripNormal = snapshot.gripNormal ? vectorFromArray(snapshot.gripNormal, null) : null;
    piece.gripAngle = finiteNumber(snapshot.gripAngle, 0);
  }

  refreshPieceGeometry(piece);
  return piece;
}

function deserializeDraftComponent(component) {
  const resourceId = component.resourceId ?? "iron";
  const resource = resources[resourceId] ?? resources.iron;
  const grid = validGrid(component.grid) ? component.grid : { ...voxelGrid };
  return {
    resourceId,
    materialIds: Array.isArray(component.materialIds) ? component.materialIds.filter(Boolean) : [resourceId],
    backpackMaterialEntryKey: typeof component.backpackMaterialEntryKey === "string" ? component.backpackMaterialEntryKey : null,
    backpackMaterialEntryKeys: Array.isArray(component.backpackMaterialEntryKeys) ? component.backpackMaterialEntryKeys.filter(Boolean) : [],
    role: component.role ?? resource.role,
    color: new THREE.Color(component.color ?? resource.color),
    baseMass: finiteNumber(component.baseMass, resource.mass),
    densityKgM3: finiteNumber(component.densityKgM3, materialDensityForIds(component.materialIds, resourceId)),
    dims: vectorFromArray(component.dims, new THREE.Vector3(...(resource.dims ?? [1, 1, 1]))),
    offset: vectorFromArray(component.offset, new THREE.Vector3()),
    grid: { ...grid },
    solid: uint8FromArray(component.solid, grid.x * grid.y * grid.z),
    gripOffset: component.gripOffset ? vectorFromArray(component.gripOffset, null) : null,
    gripNormal: component.gripNormal ? vectorFromArray(component.gripNormal, null) : null,
    gripAngle: finiteNumber(component.gripAngle, 0),
  };
}

function deserializeDraftAppearance(appearance) {
  return {
    dims: vectorFromArray(appearance.dims, new THREE.Vector3(1, 1, 1)),
    grid: validGrid(appearance.grid) ? { ...appearance.grid } : { ...appearanceGrid },
    quads: Array.isArray(appearance.quads) ? appearance.quads.map((quad) => ({
      axis: THREE.MathUtils.clamp(Number(quad.axis) || 0, 0, 2),
      side: Number(quad.side) ? 1 : 0,
      plane: THREE.MathUtils.clamp(Number(quad.plane) || 0, 0, appearanceGrid.x),
      u0: THREE.MathUtils.clamp(Number(quad.u0) || 0, 0, appearanceGrid.x),
      u1: THREE.MathUtils.clamp(Number(quad.u1) || 0, 0, appearanceGrid.x),
      v0: THREE.MathUtils.clamp(Number(quad.v0) || 0, 0, appearanceGrid.x),
      v1: THREE.MathUtils.clamp(Number(quad.v1) || 0, 0, appearanceGrid.x),
      resourceId: resources[quad.resourceId] ? quad.resourceId : "iron",
      color: validColorValue(quad.color) ? quad.color : null,
      materialIds: Array.isArray(quad.materialIds) ? quad.materialIds.filter(Boolean) : [],
    })) : [],
    gripOffset: appearance.gripOffset ? vectorFromArray(appearance.gripOffset, null) : null,
    gripNormal: appearance.gripNormal ? vectorFromArray(appearance.gripNormal, null) : null,
    gripAngle: finiteNumber(appearance.gripAngle, 0),
  };
}

function validColorValue(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/iu.test(value);
}

function createSolidVoxels(grid) {
  return new Uint8Array(grid.x * grid.y * grid.z).fill(1);
}

function voxelIndex(grid, x, y, z) {
  return x + grid.x * (y + grid.y * z);
}

function finiteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function vectorFromArray(value, fallback) {
  if (!Array.isArray(value) || value.length < 3) return fallback?.clone?.() ?? fallback;
  const vector = new THREE.Vector3(Number(value[0]), Number(value[1]), Number(value[2]));
  if (!Number.isFinite(vector.x) || !Number.isFinite(vector.y) || !Number.isFinite(vector.z)) return fallback?.clone?.() ?? fallback;
  return vector;
}

function validGrid(grid) {
  return grid &&
    Number.isInteger(grid.x) && grid.x > 0 &&
    Number.isInteger(grid.y) && grid.y > 0 &&
    Number.isInteger(grid.z) && grid.z > 0;
}

function uint8FromArray(value, total) {
  const solid = new Uint8Array(total);
  if (!Array.isArray(value)) return solid;
  for (let index = 0; index < Math.min(total, value.length); index++) solid[index] = value[index] ? 1 : 0;
  return solid;
}

function isSolid(piece, x, y, z) {
  const { grid } = piece;
  if (x < 0 || y < 0 || z < 0 || x >= grid.x || y >= grid.y || z >= grid.z) return false;
  return piece.solid[voxelIndex(grid, x, y, z)] === 1;
}

function setSolid(piece, x, y, z, value) {
  const { grid } = piece;
  if (x < 0 || y < 0 || z < 0 || x >= grid.x || y >= grid.y || z >= grid.z) return false;
  const index = voxelIndex(grid, x, y, z);
  if (piece.solid[index] === value) return false;
  piece.solid[index] = value;
  return true;
}

function refreshPieceGeometry(piece) {
  updateSolidCells(piece);
  const geometry = piece.appearance ? buildAppearanceGeometry(piece.appearance) : piece.components ? buildCompoundGeometry(piece) : buildVoxelGeometry(piece);
  piece.mesh.geometry.dispose();
  piece.mesh.geometry = geometry;
  piece.edges.geometry.dispose();
  piece.edges.geometry = new THREE.EdgesGeometry(geometry, 28);
  updatePieceMass(piece);
  validateGripBindingAfterGeometryChange(piece);
}

function buildVoxelGeometry(piece) {
  const positions = [];
  const normals = [];
  const { grid, dims } = piece;
  const cell = {
    x: dims.x / grid.x,
    y: dims.y / grid.y,
    z: dims.z / grid.z,
  };
  const dirs = [
    { n: [1, 0, 0], neighbor: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
    { n: [-1, 0, 0], neighbor: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
    { n: [0, 1, 0], neighbor: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
    { n: [0, -1, 0], neighbor: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
    { n: [0, 0, 1], neighbor: [0, 0, 1], corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
    { n: [0, 0, -1], neighbor: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
  ];

  for (let z = 0; z < grid.z; z++) {
    for (let y = 0; y < grid.y; y++) {
      for (let x = 0; x < grid.x; x++) {
        if (!isSolid(piece, x, y, z)) continue;
        for (const dir of dirs) {
          const [nx, ny, nz] = dir.neighbor;
          if (isSolid(piece, x + nx, y + ny, z + nz)) continue;
          const face = dir.corners.map(([cx, cy, cz]) => ([
            -dims.x * 0.5 + (x + cx) * cell.x,
            -dims.y * 0.5 + (y + cy) * cell.y,
            -dims.z * 0.5 + (z + cz) * cell.z,
          ]));
          pushFace(positions, normals, face, dir.n);
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

function buildCompoundGeometry(piece) {
  const positions = [];
  const normals = [];
  const colors = [];
  for (const component of piece.components) {
    appendComponentGeometry(component, positions, normals, colors);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

function buildAppearanceGeometry(appearance) {
  const positions = [];
  const normals = [];
  const colors = [];
  for (const quad of appearance.quads ?? []) {
    const color = new THREE.Color(quad.color ?? resources[quad.resourceId]?.color ?? resources.iron.color);
    pushAppearanceQuad(positions, normals, colors, appearance.dims, quad, color);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

function pushAppearanceQuad(positions, normals, colors, dims, quad, color) {
  const gridSize = appearanceGridSize();
  const axisNames = ["x", "y", "z"];
  const axis = quad.axis;
  const uAxis = axis === 0 ? 1 : 0;
  const vAxis = axis === 2 ? 1 : 2;
  const coords = [];
  const makePoint = (u, v) => {
    const values = [0, 0, 0];
    values[axis] = quad.plane;
    values[uAxis] = u;
    values[vAxis] = v;
    return new THREE.Vector3(
      -dims.x * 0.5 + (values[0] / gridSize.x) * dims.x,
      -dims.y * 0.5 + (values[1] / gridSize.y) * dims.y,
      -dims.z * 0.5 + (values[2] / gridSize.z) * dims.z,
    );
  };
  const p00 = makePoint(quad.u0, quad.v0);
  const p10 = makePoint(quad.u1, quad.v0);
  const p11 = makePoint(quad.u1, quad.v1);
  const p01 = makePoint(quad.u0, quad.v1);
  if (axis === 0) coords.push(...(quad.side ? [p00, p10, p11, p01] : [p01, p11, p10, p00]));
  if (axis === 1) coords.push(...(quad.side ? [p01, p11, p10, p00] : [p00, p10, p11, p01]));
  if (axis === 2) coords.push(...(quad.side ? [p10, p11, p01, p00] : [p00, p01, p11, p10]));
  const normal = [0, 0, 0];
  normal[axis] = quad.side ? 1 : -1;
  pushColoredFace(positions, normals, colors, coords.map((point) => point.toArray()), normal, color);
}

function appearanceGridSize() {
  return appearanceGrid;
}

function appendComponentGeometry(component, positions, normals, colors) {
  const { grid, dims, offset } = component;
  const cell = {
    x: dims.x / grid.x,
    y: dims.y / grid.y,
    z: dims.z / grid.z,
  };
  const color = component.color ?? new THREE.Color(resources[component.resourceId]?.color ?? 0xb46f42);
  const dirs = [
    { n: [1, 0, 0], neighbor: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
    { n: [-1, 0, 0], neighbor: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
    { n: [0, 1, 0], neighbor: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
    { n: [0, -1, 0], neighbor: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
    { n: [0, 0, 1], neighbor: [0, 0, 1], corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
    { n: [0, 0, -1], neighbor: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
  ];

  for (let z = 0; z < grid.z; z++) {
    for (let y = 0; y < grid.y; y++) {
      for (let x = 0; x < grid.x; x++) {
        if (component.solid[voxelIndex(grid, x, y, z)] !== 1) continue;
        for (const dir of dirs) {
          const [nx, ny, nz] = dir.neighbor;
          if (isComponentSolid(component, x + nx, y + ny, z + nz)) continue;
          const face = dir.corners.map(([cx, cy, cz]) => ([
            offset.x - dims.x * 0.5 + (x + cx) * cell.x,
            offset.y - dims.y * 0.5 + (y + cy) * cell.y,
            offset.z - dims.z * 0.5 + (z + cz) * cell.z,
          ]));
          pushColoredFace(positions, normals, colors, face, dir.n, color);
        }
      }
    }
  }
}

function isComponentSolid(component, x, y, z) {
  const { grid } = component;
  if (x < 0 || y < 0 || z < 0 || x >= grid.x || y >= grid.y || z >= grid.z) return false;
  return component.solid[voxelIndex(grid, x, y, z)] === 1;
}

function pushFace(positions, normals, corners, normal) {
  const order = [0, 1, 2, 0, 2, 3];
  for (const index of order) {
    positions.push(...corners[index]);
    normals.push(...normal);
  }
}

function pushColoredFace(positions, normals, colors, corners, normal, color) {
  const order = [0, 1, 2, 0, 2, 3];
  for (const index of order) {
    positions.push(...corners[index]);
    normals.push(...normal);
    colors.push(color.r, color.g, color.b);
  }
}

function updatePieceMass(piece) {
  if (piece.components) {
    piece.mass = roundPhysicalValue(piece.components.reduce((sum, component) => sum + componentMassKg(component), 0), 4);
    piece.baseMass = roundPhysicalValue(piece.components.reduce((sum, component) => sum + componentFullMassKg(component), 0), 4);
    piece.densityKgM3 = weightedDensityForComponents(piece.components);
    return;
  }
  piece.densityKgM3 = piece.densityKgM3 ?? materialDensityForIds(piece.materialIds, piece.resourceId);
  piece.baseMass = componentFullMassKg(piece);
  piece.mass = componentMassKg(piece);
}

function updateSolidCells(piece) {
  if (piece.appearance) return;
  if (piece.components) {
    for (const component of piece.components) updateComponentSolidCells(component);
    return;
  }
  updateComponentSolidCells(piece);
}

function updateComponentSolidCells(component) {
  component.solidCells = solidCellsFor(component);
  component.fullSolid = component.solidCells.length === component.grid.x * component.grid.y * component.grid.z;
}

function solidCellsFor(component) {
  const cells = [];
  for (let z = 0; z < component.grid.z; z++) {
    for (let y = 0; y < component.grid.y; y++) {
      for (let x = 0; x < component.grid.x; x++) {
        if (component.solid[voxelIndex(component.grid, x, y, z)] === 1) cells.push([x, y, z]);
      }
    }
  }
  return cells;
}

function findOpenPlacement(piece) {
  const candidates = [];
  for (const other of pieces) {
    const xDistance = (other.dims.x + piece.dims.x) * 0.5;
    const zDistance = (other.dims.z + piece.dims.z) * 0.5;
    candidates.push(
      [other.offset.x + xDistance, 0, other.offset.z],
      [other.offset.x - xDistance, 0, other.offset.z],
      [other.offset.x, 0, other.offset.z + zDistance],
      [other.offset.x, 0, other.offset.z - zDistance],
    );
  }

  const slots = [
    [0, 0, 0],
    [-1.32, 0, 0],
    [1.32, 0, 0],
    [0, 0, -1.08],
    [0, 0, 1.08],
    [-1.32, 0, -1.08],
    [1.32, 0, -1.08],
    [-1.32, 0, 1.08],
    [1.32, 0, 1.08],
  ];

  for (const slot of [...candidates, ...slots]) {
    const candidate = new THREE.Vector3(
      clampOffset("x", slot[0]),
      clampOffset("y", slot[1]),
      clampOffset("z", slot[2]),
    );
    const supportY = highestSurfaceOffsetY(piece, candidate);
    if (supportY !== null) candidate.y = supportY;
    if (!wouldCollide(piece, candidate)) return candidate;
  }
  return null;
}

function disposePiece(piece) {
  piece.mesh.geometry.dispose();
  piece.mesh.material.dispose();
  piece.edges.geometry.dispose();
  piece.edges.material.dispose();
}

function hammerHit() {
  if (!hammerEnabled) {
    setStatus("forging.status.glovesReady");
    return;
  }
  if (!pieces.length) {
    setStatus("forging.status.empty");
    return;
  }

  const target = toolTargetFromPointer({ preferSelected: true });
  if (!target) {
    setStatus("forging.status.miss");
    return;
  }

  const { piece, point, normal } = target;
  if (piece.components) {
    setStatus("forging.status.castLocked");
    return;
  }
  selectPiece(piece);
  if (compressFace(piece, normal, point)) setStatus("forging.status.hit");
}

function setGripFromPointer() {
  if (!pieces.length) {
    setStatus("forging.status.empty");
    return;
  }
  const target = toolTargetFromPointer({ allowSelectedFallback: false, preferSelected: true });
  if (!target) {
    setStatus("forging.status.miss");
    return;
  }
  const grip = gripCandidateFromTarget(target, { log: true, context: "click" });
  if (!grip?.valid) {
    if (grip?.blockedByAvatarCollision) {
      playGripCollisionFailureAnimation(target.piece, grip);
    } else {
      clearGripCollisionFeedback();
      playGripFailureDropAnimation(target.piece, grip);
    }
    setStatus(grip?.blockedByAvatarCollision ? "forging.status.gripBlocked" : "forging.status.gripTooLarge");
    return;
  }
  clearGripCollisionFeedback();
  assignGripOffset(target.piece, grip.localPoint, grip.normal, grip.angle);
  selectPiece(target.piece);
  setStatus("forging.status.gripSet");
  updateHud();
  markEquipmentPreviewDirty();
  updateGripBindingMarker();
  updateHoveredFace();
}

function assignGripOffset(piece, localPoint, normal = null, angle = 0) {
  if (!piece || !localPoint) return;
  const grip = localPoint.clone();
  const gripNormal = normal?.clone?.() ?? null;
  const gripAngle = normalizeGripAngle(angle);
  if (piece.appearance) {
    piece.gripOffset = grip;
    piece.gripNormal = gripNormal;
    piece.gripAngle = gripAngle;
    piece.appearance.gripOffset = grip.clone();
    piece.appearance.gripNormal = gripNormal?.clone?.() ?? null;
    piece.appearance.gripAngle = gripAngle;
    currentChainCode = "";
    chainCodeOutput.value = "";
    return;
  }
  piece.gripOffset = grip;
  piece.gripNormal = gripNormal;
  piece.gripAngle = gripAngle;
  currentChainCode = "";
  chainCodeOutput.value = "";
}

function validateGripBindingAfterGeometryChange(piece) {
  if (!piece?.gripOffset || !piece.gripNormal) return true;
  if (isGripBindingStillValid(piece)) return true;
  clearGripBinding(piece);
  if (selectedPiece === piece) updateGripBindingMarker();
  markEquipmentPreviewDirty();
  currentChainCode = "";
  chainCodeOutput.value = "";
  return false;
}

function clearGripBinding(piece) {
  if (!piece) return;
  piece.gripOffset = null;
  piece.gripNormal = null;
  piece.gripAngle = 0;
  if (piece.appearance) {
    piece.appearance.gripOffset = null;
    piece.appearance.gripNormal = null;
    piece.appearance.gripAngle = 0;
  }
  for (const component of piece.components ?? []) {
    component.gripOffset = null;
    component.gripNormal = null;
    component.gripAngle = 0;
  }
}

function isGripBindingStillValid(piece) {
  if (!piece?.gripOffset || !piece.gripNormal) return false;
  const normal = piece.gripNormal.clone().normalize();
  if (!Number.isFinite(normal.lengthSq()) || normal.lengthSq() < 0.5) return false;
  let localPoint = piece.gripOffset.clone();
  const normalAxis = dominantAxis(normal);
  if (!localPointWithinPieceBounds(piece, localPoint, normalAxis)) return false;

  if (piece.components || piece.appearance) {
    return compoundGripBindingStillValid(piece, localPoint, normal, normalAxis);
  }

  const surface = gripSurfaceCellForLocalPoint(piece, localPoint, normal);
  if (!surface) return false;
  localPoint = surface.localPoint ?? localPoint;
  if (!pointStillOnSurfacePlane(piece, localPoint, normal, normalAxis)) return false;
  const region = gripSurfaceRegionForCell(piece, surface.cell, normal);
  if (!region || !pointWithinGripRegion(localPoint, region)) return false;
  const marker = buildGripPlacementMarkerGeometry(
    piece,
    localPoint,
    normal,
    avatarHandGripFootprint.x,
    avatarHandGripFootprint.y,
    piece.gripAngle ?? 0,
  );
  const fit = evaluateGripFit(avatarHandGripFootprint.x, avatarHandGripFootprint.y, region.sizeA, region.sizeB, {
    normalAxis,
    contactArea: marker.contactArea,
    foldedArea: marker.foldedArea,
    patchCount: marker.patchCount,
  });
  if (!fit.valid) return false;
  if (gripCandidateCollidesWithAvatar(piece, localPoint, normal, piece.gripAngle ?? 0)) return false;
  if (!localPoint.equals(piece.gripOffset)) piece.gripOffset.copy(localPoint);
  return true;
}

function localPointWithinPieceBounds(piece, localPoint, normalAxis) {
  const bounds = gripValidationBounds(piece);
  if (!bounds) return false;
  const epsilon = 0.002;
  for (let axis = 0; axis < 3; axis++) {
    const value = localPoint.getComponent(axis);
    const min = bounds.min.getComponent(axis);
    const max = bounds.max.getComponent(axis);
    if (axis === normalAxis) continue;
    if (value < min - epsilon || value > max + epsilon) return false;
  }
  return true;
}

function gripValidationBounds(piece) {
  if (!piece) return null;
  if (piece.components || piece.appearance) {
    if (!piece.mesh.geometry.boundingBox) piece.mesh.geometry.computeBoundingBox();
    return piece.mesh.geometry.boundingBox ?? null;
  }
  return new THREE.Box3(
    piece.dims.clone().multiplyScalar(-0.5),
    piece.dims.clone().multiplyScalar(0.5),
  );
}

function pointStillOnSurfacePlane(piece, localPoint, normal, normalAxis) {
  const sign = Math.sign(normal.getComponent(normalAxis)) || 1;
  const plane = sign > 0
    ? piece.dims.getComponent(normalAxis) * 0.5
    : -piece.dims.getComponent(normalAxis) * 0.5;
  const cellSize = piece.dims.getComponent(normalAxis) / piece.grid[axisKey(normalAxis)];
  const tolerance = Math.max(0.004, cellSize * 0.34);
  const inwardDepth = sign * (plane - localPoint.getComponent(normalAxis));
  return inwardDepth >= -tolerance && inwardDepth <= gripContactConformDepth + tolerance;
}

function compoundGripBindingStillValid(piece, localPoint, normal, normalAxis) {
  const componentGrip = compoundGripSurfaceForLocalPoint(piece, localPoint, normal);
  if (!componentGrip) return false;
  localPoint = componentGrip.localPoint;
  const region = componentGrip.region;
  if (!region || !pointWithinGripRegion(localPoint, region)) return false;
  const marker = buildCompoundGripPlacementMarkerGeometry(
    componentGrip,
    localPoint,
    normal,
    avatarHandGripFootprint.x,
    avatarHandGripFootprint.y,
    piece.gripAngle ?? 0,
  );
  const fit = evaluateGripFit(avatarHandGripFootprint.x, avatarHandGripFootprint.y, region.sizeA, region.sizeB, {
    normalAxis,
    contactArea: marker.contactArea,
    foldedArea: marker.foldedArea,
    patchCount: marker.patchCount,
  });
  if (!fit.valid) return false;
  if (gripCandidateCollidesWithAvatar(piece, localPoint, normal, piece.gripAngle ?? 0, {
    sourcePieces: componentGrip.sourcePieces,
  })) return false;
  if (!localPoint.equals(piece.gripOffset)) piece.gripOffset.copy(localPoint);
  return true;
}

function pointWithinGripRegion(localPoint, region) {
  const epsilon = 0.002;
  const a = localPoint.getComponent(region.axes[0]);
  const b = localPoint.getComponent(region.axes[1]);
  return (
    a >= region.minA - epsilon &&
    a <= region.maxA + epsilon &&
    b >= region.minB - epsilon &&
    b <= region.maxB + epsilon
  );
}

function compressFace(piece, normal, hitPoint) {
  const heatFactor = THREE.MathUtils.clamp(piece.heat / 100, 0.18, 1);
  const hardnessFactor = THREE.MathUtils.clamp(1.1 - piece.hardness * 0.55, 0.48, 0.92);
  const axis = dominantAxis(normal);
  const amount = 0.08 * heatFactor * hardnessFactor;
  const oldSize = piece.dims.getComponent(axis);
  const delta = oldSize * amount;
  if (delta <= Number.EPSILON) return;

  const beforeDims = piece.dims.clone();
  const beforeOffset = piece.offset.clone();
  const bottomBefore = pieceBox(piece, beforeOffset).min.y;
  const nextSize = oldSize - delta;
  const sideScale = Math.sqrt(oldSize / nextSize);
  piece.dims.setComponent(axis, nextSize);
  piece.offset.setComponent(axis, piece.offset.getComponent(axis) - normal.getComponent(axis) * delta * 0.5);

  for (const sideAxis of [0, 1, 2]) {
    if (sideAxis === axis) continue;
    piece.dims.setComponent(sideAxis, piece.dims.getComponent(sideAxis) * sideScale);
  }

  anchorDeformedPieceToSupport(piece, bottomBefore, axis);
  if (staticGeometryOverlap(piece, piece.offset) && !liftPieceOutOfStaticCollision(piece)) {
    piece.dims.copy(beforeDims);
    piece.offset.copy(beforeOffset);
    setStatus("forging.status.miss");
    return false;
  }
  relaxOverlappingPiecesFrom(piece);

  piece.heat = Math.max(0, piece.heat - 4);
  triggerHammer(hitPoint, normal);
  refreshPieceGeometry(piece);
  updatePiece(piece);
  settleAllPieces();
  updateHud();
  return true;
}

function anchorDeformedPieceToSupport(piece, bottomBefore, compressedAxis) {
  const bottomAfter = pieceBox(piece, piece.offset).min.y;
  if (compressedAxis !== 1 || bottomAfter < bottomBefore - 0.0005) {
    piece.offset.y += bottomBefore - bottomAfter;
  }
}

function resolveShapeCollision(piece, originOffset, sizeDelta) {
  const directions = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(1, 0, 1).normalize(),
    new THREE.Vector3(1, 0, -1).normalize(),
    new THREE.Vector3(-1, 0, 1).normalize(),
    new THREE.Vector3(-1, 0, -1).normalize(),
    new THREE.Vector3(0, 1, 0),
  ];
  const step = Math.max(0.025, sizeDelta * 0.28);
  for (let ring = 1; ring <= 18; ring++) {
    for (const direction of directions) {
      const candidate = originOffset.clone().add(direction.clone().multiplyScalar(step * ring));
      if (!wouldCollide(piece, candidate)) {
        piece.offset.copy(candidate);
        return true;
      }
    }
  }
  return false;
}

function liftPieceOutOfStaticCollision(piece) {
  for (let pass = 0; pass < 4; pass++) {
    const lift = staticCollisionLiftY(piece, piece.offset);
    if (lift <= 0) return !staticGeometryOverlap(piece, piece.offset);
    piece.offset.y += lift;
  }
  return !staticGeometryOverlap(piece, piece.offset);
}

function staticCollisionLiftY(piece, offset) {
  let lift = 0;
  for (const component of collisionComponents(piece, offset)) {
    const boxes = componentIsFullySolid(component)
      ? [componentBox(component)]
      : (component.solidCells ?? solidCellsFor(component)).map((cell) => voxelCellBox(component, cell));
    for (const box of boxes) {
      for (const staticBox of staticCollisionBoxes) {
        if (!boxesOverlap(box, staticBox)) continue;
        lift = Math.max(lift, staticBox.max.y - box.min.y + 0.002);
      }
    }
  }
  return lift;
}

function relaxOverlappingPiecesFrom(anchorPiece) {
  const movedPieces = new Set();
  for (let pass = 0; pass < 14; pass++) {
    let movedThisPass = false;
    for (let index = 0; index < pieces.length; index++) {
      for (let otherIndex = index + 1; otherIndex < pieces.length; otherIndex++) {
        const first = pieces[index];
        const second = pieces[otherIndex];
        if (!piecesOverlapAtCurrentOffset(first, second)) continue;
        const mover = overlapMoverForPair(anchorPiece, first, second);
        if (!mover || mover === anchorPiece) continue;
        const blocker = mover === first ? second : first;
        const push = separationVectorForPieces(blocker, mover);
        if (!push || push.lengthSq() <= 0.000001) continue;
        if (!movePieceByRelaxation(mover, push, blocker)) continue;
        movedPieces.add(mover);
        movedThisPass = true;
      }
    }
    if (!movedThisPass) break;
  }
  for (const piece of movedPieces) updatePiece(piece);
}

function piecesOverlapAtCurrentOffset(a, b) {
  return boxesOverlap(pieceBox(a, a.offset), pieceBox(b, b.offset)) && voxelShapesOverlap(a, a.offset, b, b.offset);
}

function overlapMoverForPair(anchorPiece, first, second) {
  if (first === anchorPiece) return second;
  if (second === anchorPiece) return first;
  const firstCenter = pieceBox(first, first.offset).getCenter(new THREE.Vector3());
  const secondCenter = pieceBox(second, second.offset).getCenter(new THREE.Vector3());
  return firstCenter.y >= secondCenter.y ? first : second;
}

function separationVectorForPieces(blocker, mover) {
  const blockerBox = pieceBox(blocker, blocker.offset);
  const moverBox = pieceBox(mover, mover.offset);
  return separationVectorForBoxes(blockerBox, moverBox);
}

function separationVectorForBoxes(blockerBox, moverBox) {
  const blockerCenter = blockerBox.getCenter(new THREE.Vector3());
  const moverCenter = moverBox.getCenter(new THREE.Vector3());
  const overlaps = [
    Math.min(blockerBox.max.x - moverBox.min.x, moverBox.max.x - blockerBox.min.x),
    Math.min(blockerBox.max.y - moverBox.min.y, moverBox.max.y - blockerBox.min.y),
    Math.min(blockerBox.max.z - moverBox.min.z, moverBox.max.z - blockerBox.min.z),
  ];
  if (overlaps.some((value) => value <= 0)) return null;
  let axis = overlaps.indexOf(Math.min(...overlaps));
  if (moverCenter.y >= blockerCenter.y && overlaps[1] <= Math.min(overlaps[0], overlaps[2]) * 1.35) axis = 1;
  const direction = Math.sign(moverCenter.getComponent(axis) - blockerCenter.getComponent(axis)) || (axis === 1 ? 1 : 0);
  if (!direction) return null;
  const vector = new THREE.Vector3();
  vector.setComponent(axis, direction * (overlaps[axis] + 0.018));
  return vector;
}

function movePieceByRelaxation(piece, push, blocker) {
  const candidate = piece.offset.clone().add(push);
  if (!staticGeometryOverlap(piece, candidate) && !overlapsAnyPieceExcept(piece, candidate, blocker)) {
    piece.offset.copy(candidate);
    return true;
  }
  const alternatives = relaxationAlternativePushes(push);
  for (const alternative of alternatives) {
    const next = piece.offset.clone().add(alternative);
    if (staticGeometryOverlap(piece, next) || overlapsAnyPieceExcept(piece, next, blocker)) continue;
    piece.offset.copy(next);
    return true;
  }
  if (!staticGeometryOverlap(piece, candidate)) {
    piece.offset.copy(candidate);
    return true;
  }
  return false;
}

function overlapsAnyPieceExcept(piece, offset, exceptPiece) {
  const nextBox = pieceBox(piece, offset);
  return pieces.some((other) => (
    other !== piece &&
    other !== exceptPiece &&
    boxesOverlap(nextBox, pieceBox(other, other.offset)) &&
    voxelShapesOverlap(piece, offset, other, other.offset)
  ));
}

function relaxationAlternativePushes(push) {
  if (Math.abs(push.y) > Math.abs(push.x) && Math.abs(push.y) > Math.abs(push.z)) {
    return [
      push.clone().add(new THREE.Vector3(0.045, 0, 0)),
      push.clone().add(new THREE.Vector3(-0.045, 0, 0)),
      push.clone().add(new THREE.Vector3(0, 0, 0.045)),
      push.clone().add(new THREE.Vector3(0, 0, -0.045)),
    ];
  }
  return [
    push.clone().add(new THREE.Vector3(0, 0.045, 0)),
    push.clone().multiplyScalar(1.35),
  ];
}

function normalizePiece() {
  if (!selectedPiece) {
    setStatus("forging.status.empty");
    return;
  }
  if (selectedPiece.components) {
    setStatus("forging.status.castLocked");
    return;
  }
  const piece = selectedPiece;
  const average = (piece.dims.x + piece.dims.y + piece.dims.z) / 3;
  const before = piece.dims.clone();
  const beforeOffset = piece.offset.clone();
  piece.dims.lerp(new THREE.Vector3(average, average, average), 0.34);
  piece.offset.multiplyScalar(0.8);
  if (wouldCollide(piece, piece.offset)) {
    piece.dims.copy(before);
    piece.offset.copy(beforeOffset);
    setStatus("forging.status.miss");
    return;
  }
  setStatus("forging.status.normalized");
  refreshPieceGeometry(piece);
  updatePiece(piece);
  updateHud();
}

function rotateSelectedPiece(axis) {
  if (!selectedPiece) {
    setStatus("forging.status.empty");
    return;
  }

  const piece = selectedPiece;
  const bottomBefore = pieceBox(piece, piece.offset).min.y;
  const before = pieceRotationSnapshot(piece);

  rotatePiece(piece, axis);
  const bottomAfter = pieceBox(piece, piece.offset).min.y;
  piece.offset.y += bottomBefore - bottomAfter;
  refreshPieceGeometry(piece);
  if (wouldCollide(piece, piece.offset)) {
    restorePieceRotationSnapshot(piece, before);
    refreshPieceGeometry(piece);
    setStatus("forging.status.miss");
    return;
  }

  updatePiece(piece);
  if (selectedTool !== "gloves") settleAllPieces();
  setStatus("forging.status.rotated");
  updateHud();
}

function removeSelectedPiece() {
  if (!selectedPiece) {
    setStatus("forging.status.empty");
    return;
  }

  removePiece(selectedPiece);
  setStatus("forging.status.pieceRemoved");
  updateHud();
}

function pieceRotationSnapshot(piece) {
  const snapshot = {
    dims: piece.dims.clone(),
    offset: piece.offset.clone(),
  };
  if (piece.components) {
    snapshot.components = piece.components.map((component) => cloneComponent(component));
  } else {
    snapshot.grid = { ...piece.grid };
    snapshot.solid = new Uint8Array(piece.solid);
    snapshot.gripOffset = piece.gripOffset?.clone?.() ?? null;
    snapshot.gripNormal = piece.gripNormal?.clone?.() ?? null;
    snapshot.gripAngle = piece.gripAngle ?? 0;
  }
  return snapshot;
}

function restorePieceRotationSnapshot(piece, snapshot) {
  piece.dims.copy(snapshot.dims);
  piece.offset.copy(snapshot.offset);
  if (snapshot.components) {
    piece.components = snapshot.components.map((component) => cloneComponent(component));
    return;
  }
  piece.grid = snapshot.grid;
  piece.solid = snapshot.solid;
  piece.gripOffset = snapshot.gripOffset;
  piece.gripNormal = snapshot.gripNormal;
  piece.gripAngle = snapshot.gripAngle ?? 0;
}

function cloneComponent(component) {
  return {
    ...component,
    backpackMaterialEntryKeys: [...(component.backpackMaterialEntryKeys ?? [])],
    fullSolid: Boolean(component.fullSolid),
    color: component.color?.clone?.() ?? component.color,
    dims: component.dims.clone(),
    offset: component.offset.clone(),
    grid: { ...component.grid },
    solid: new Uint8Array(component.solid),
    solidCells: component.solidCells?.map((cell) => [...cell]),
    gripOffset: component.gripOffset?.clone?.() ?? null,
    gripNormal: component.gripNormal?.clone?.() ?? null,
    gripAngle: component.gripAngle ?? 0,
  };
}

function rotatePiece(piece, axis) {
  if (piece.components) {
    rotatePieceComponents(piece, axis);
    return;
  }
  rotatePieceVoxels(piece, axis);
}

function rotatePieceVoxels(piece, axis) {
  const oldGrid = piece.grid;
  const oldSolid = piece.solid;
  const oldDims = piece.dims.clone();
  const nextGrid = rotatedGrid(oldGrid, axis);
  const nextSolid = new Uint8Array(nextGrid.x * nextGrid.y * nextGrid.z);

  for (let z = 0; z < oldGrid.z; z++) {
    for (let y = 0; y < oldGrid.y; y++) {
      for (let x = 0; x < oldGrid.x; x++) {
        const value = oldSolid[voxelIndex(oldGrid, x, y, z)];
        if (!value) continue;
        const next = rotatedCoordinate(x, y, z, oldGrid, axis);
        nextSolid[voxelIndex(nextGrid, next[0], next[1], next[2])] = value;
      }
    }
  }

  piece.grid = nextGrid;
  piece.solid = nextSolid;
  if (axis === "x") piece.dims.set(oldDims.x, oldDims.z, oldDims.y);
  if (axis === "y") piece.dims.set(oldDims.z, oldDims.y, oldDims.x);
  if (axis === "z") piece.dims.set(oldDims.y, oldDims.x, oldDims.z);
  if (piece.gripOffset) piece.gripOffset.copy(rotatedVector(piece.gripOffset, axis));
  if (piece.gripNormal) piece.gripNormal.copy(rotatedVector(piece.gripNormal, axis).normalize());
}

function rotatePieceComponents(piece, axis) {
  for (const component of piece.components) {
    rotateComponentVoxels(component, axis);
    component.offset.copy(rotatedVector(component.offset, axis));
    if (component.gripOffset) component.gripOffset.copy(rotatedVector(component.gripOffset, axis));
    if (component.gripNormal) component.gripNormal.copy(rotatedVector(component.gripNormal, axis).normalize());
  }
  piece.dims.copy(localBoundsForPieces([piece]).getSize(new THREE.Vector3()));
}

function rotateComponentVoxels(component, axis) {
  const oldGrid = component.grid;
  const oldSolid = component.solid;
  const oldDims = component.dims.clone();
  const nextGrid = rotatedGrid(oldGrid, axis);
  const nextSolid = new Uint8Array(nextGrid.x * nextGrid.y * nextGrid.z);

  for (let z = 0; z < oldGrid.z; z++) {
    for (let y = 0; y < oldGrid.y; y++) {
      for (let x = 0; x < oldGrid.x; x++) {
        const value = oldSolid[voxelIndex(oldGrid, x, y, z)];
        if (!value) continue;
        const next = rotatedCoordinate(x, y, z, oldGrid, axis);
        nextSolid[voxelIndex(nextGrid, next[0], next[1], next[2])] = value;
      }
    }
  }

  component.grid = nextGrid;
  component.solid = nextSolid;
  if (axis === "x") component.dims.set(oldDims.x, oldDims.z, oldDims.y);
  if (axis === "y") component.dims.set(oldDims.z, oldDims.y, oldDims.x);
  if (axis === "z") component.dims.set(oldDims.y, oldDims.x, oldDims.z);
}

function rotatedVector(vector, axis) {
  if (axis === "x") return new THREE.Vector3(vector.x, -vector.z, vector.y);
  if (axis === "y") return new THREE.Vector3(vector.z, vector.y, -vector.x);
  return new THREE.Vector3(-vector.y, vector.x, vector.z);
}

function rotatedGrid(grid, axis) {
  if (axis === "x") return { x: grid.x, y: grid.z, z: grid.y };
  if (axis === "y") return { x: grid.z, y: grid.y, z: grid.x };
  return { x: grid.y, y: grid.x, z: grid.z };
}

function rotatedCoordinate(x, y, z, grid, axis) {
  if (axis === "x") return [x, grid.z - 1 - z, y];
  if (axis === "y") return [z, y, grid.x - 1 - x];
  return [grid.y - 1 - y, x, z];
}

function settleAllPieces() {
  for (let pass = 0; pass < 6; pass++) {
    let moved = false;
    const ordered = [...pieces].sort((a, b) => pieceBox(a, a.offset).min.y - pieceBox(b, b.offset).min.y);
    for (const piece of ordered) moved = settlePiece(piece) || moved;
    if (!moved) break;
  }
}

function settlePiece(piece) {
  let current = piece.offset.clone();
  for (let step = 0; step < settleMaxSteps; step++) {
    const next = current.clone();
    next.y -= settleStep;
    const supportY = highestStaticSupportOffsetY(piece, current);
    if (supportY !== null && supportY >= next.y - 0.0001) {
      current.y = supportY;
      return applySettledOffset(piece, current);
    }
    if (wouldCollideWithPieces(piece, next)) {
      current = contactOffsetBeforeCollision(piece, current, next);
      return applySettledOffset(piece, current);
    }
    current = next;
  }
  return applySettledOffset(piece, current);
}

function applySettledOffset(piece, offset) {
  if (piece.offset.distanceToSquared(offset) <= 0.000001) return false;
  piece.offset.copy(offset);
  updatePiece(piece);
  return true;
}

function workbenchPiecesAreConnected(sourcePieces) {
  if (sourcePieces.length <= 1) return true;
  const pieceCells = sourcePieces.map((piece) => solidWorldCellBoxes(piece));
  const visited = new Set([0]);
  const pending = [0];

  while (pending.length) {
    const index = pending.shift();
    for (let other = 0; other < pieceCells.length; other++) {
      if (visited.has(other)) continue;
      if (!cellGroupsTouch(pieceCells[index], pieceCells[other])) continue;
      visited.add(other);
      pending.push(other);
    }
  }

  return visited.size === sourcePieces.length;
}

function solidWorldCellBoxes(piece) {
  const boxes = [];
  for (const component of collisionComponents(piece, piece.offset)) {
    const cells = component.solidCells ?? solidCellsFor(component);
    for (const cell of cells) boxes.push(voxelCellBox(component, cell));
  }
  return boxes;
}

function cellGroupsTouch(a, b) {
  for (const boxA of a) {
    for (const boxB of b) {
      if (boxesShareFace(boxA, boxB)) return true;
    }
  }
  return false;
}

function boxesShareFace(a, b) {
  const epsilon = 0.0015;
  const touchX = Math.abs(a.max.x - b.min.x) <= epsilon || Math.abs(b.max.x - a.min.x) <= epsilon;
  const touchY = Math.abs(a.max.y - b.min.y) <= epsilon || Math.abs(b.max.y - a.min.y) <= epsilon;
  const touchZ = Math.abs(a.max.z - b.min.z) <= epsilon || Math.abs(b.max.z - a.min.z) <= epsilon;
  return (
    (touchX && intervalsOverlap(a.min.y, a.max.y, b.min.y, b.max.y, epsilon) && intervalsOverlap(a.min.z, a.max.z, b.min.z, b.max.z, epsilon)) ||
    (touchY && intervalsOverlap(a.min.x, a.max.x, b.min.x, b.max.x, epsilon) && intervalsOverlap(a.min.z, a.max.z, b.min.z, b.max.z, epsilon)) ||
    (touchZ && intervalsOverlap(a.min.x, a.max.x, b.min.x, b.max.x, epsilon) && intervalsOverlap(a.min.y, a.max.y, b.min.y, b.max.y, epsilon))
  );
}

function intervalsOverlap(aMin, aMax, bMin, bMax, epsilon) {
  return aMin < bMax - epsilon && aMax > bMin + epsilon;
}

function contactOffsetBeforeCollision(piece, clearOffset, collidingOffset) {
  let high = clearOffset.clone();
  let low = collidingOffset.clone();
  for (let index = 0; index < 10; index++) {
    const mid = high.clone().lerp(low, 0.5);
    if (wouldCollideWithPieces(piece, mid)) low = mid;
    else high = mid;
  }
  return high;
}

function highestStaticSupportOffsetY(piece, offset) {
  let best = -Infinity;
  for (const component of collisionComponents(piece, offset)) {
    const cells = component.solidCells ?? solidCellsFor(component);
    for (const cell of cells) {
      const box = voxelCellBox(component, cell);
      for (const surface of staticSupportSurfaces) {
        if (!boxOverlapsSurfaceXZ(box, surface)) continue;
        const candidate = offset.y + surface.y - box.min.y;
        if (candidate <= offset.y + 0.0001) best = Math.max(best, candidate);
      }
    }
  }
  return best === -Infinity ? null : best;
}

function highestSurfaceOffsetY(piece, offset) {
  let best = -Infinity;
  for (const component of collisionComponents(piece, offset)) {
    const cells = component.solidCells ?? solidCellsFor(component);
    for (const cell of cells) {
      const box = voxelCellBox(component, cell);
      for (const surface of staticSupportSurfaces) {
        if (!boxOverlapsSurfaceXZ(box, surface)) continue;
        best = Math.max(best, offset.y + surface.y - box.min.y);
      }
    }
  }
  return best === -Infinity ? null : best;
}

function clearPiece() {
  clearWorkbench();
  currentChainCode = "";
  chainCodeOutput.value = "";
  setStatus("forging.status.cleared");
  updateHud();
}

function clearWorkbench() {
  for (const piece of pieces) {
    scene.remove(piece.mesh, piece.edges);
    disposePiece(piece);
  }
  pieces.length = 0;
  selectableMeshes.length = 0;
  selectedPiece = null;
  syncUsedBackpackMaterialEntriesFromWorkbench();
  updateMoveGizmo();
  markEquipmentPreviewDirty();
  faceMarker.visible = false;
}

function loadForgeDrafts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(forgeDraftsStorageKey) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((draft) => typeof draft?.id === "string" && (typeof draft?.code === "string" || draft?.state))
      : [];
  } catch {
    return [];
  }
}

function writeForgeDrafts(drafts) {
  localStorage.setItem(forgeDraftsStorageKey, JSON.stringify(drafts.slice(-maxForgeDrafts)));
}

function saveCurrentDraft(asNew = false) {
  if (!pieces.length) {
    setStatus("forging.status.empty");
    return;
  }
  ensureCurrentChainCode();
  const state = serializeWorkbenchDraft();

  const drafts = loadForgeDrafts();
  const existingIndex = asNew || !activeDraftId ? -1 : drafts.findIndex((draft) => draft.id === activeDraftId);
  const savedAt = Date.now();
  if (existingIndex >= 0) {
    drafts[existingIndex] = {
      ...drafts[existingIndex],
      code: currentChainCode,
      state,
      savedAt,
    };
    activeDraftId = drafts[existingIndex].id;
  } else {
    const nextIndex = drafts.length + 1;
    const draft = {
      id: `draft-${savedAt.toString(36)}`,
      name: t("forging.draftName", { index: nextIndex }),
      code: currentChainCode,
      state,
      savedAt,
    };
    drafts.push(draft);
    activeDraftId = draft.id;
  }

  writeForgeDrafts(drafts);
  localStorage.setItem(activeForgeDraftStorageKey, activeDraftId);
  renderDraftList();
  setStatus("forging.status.draftSaved");
}

function renderDraftList() {
  const drafts = loadForgeDrafts().sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
  if (!drafts.length) {
    const empty = document.createElement("p");
    empty.className = "draft-empty";
    empty.textContent = t("forging.noDrafts");
    draftList.replaceChildren(empty);
    return;
  }

  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const entries = drafts.map((draft) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "draft-entry";
    button.classList.toggle("active", draft.id === activeDraftId);
    button.setAttribute("aria-pressed", String(draft.id === activeDraftId));
    const title = document.createElement("strong");
    title.textContent = draft.name || t("forging.draftName", { index: drafts.length });
    const savedAt = document.createElement("span");
    savedAt.textContent = draft.savedAt ? dateFormatter.format(new Date(draft.savedAt)) : "";
    button.append(title, savedAt);
    button.addEventListener("click", () => loadDraft(draft.id));
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      showDraftContextMenu(draft.id, event.clientX, event.clientY);
      hideForgeContextMenu();
      hideToolSettingsMenu();
    });
    return button;
  });
  draftList.replaceChildren(...entries);
}

function renameDraft(draftId) {
  const drafts = loadForgeDrafts();
  const index = drafts.findIndex((draft) => draft.id === draftId);
  if (index < 0) {
    hideDraftContextMenu();
    renderDraftList();
    return;
  }
  const currentName = drafts[index].name || t("forging.draftName", { index: index + 1 });
  hideDraftContextMenu();
  const nextName = window.prompt(t("forging.draftRenamePrompt"), currentName);
  if (nextName == null) return;
  const trimmed = nextName.trim();
  if (!trimmed) return;
  drafts[index] = { ...drafts[index], name: trimmed.slice(0, 64) };
  writeForgeDrafts(drafts);
  renderDraftList();
  setStatus("forging.status.draftRenamed");
}

function deleteDraft(draftId) {
  const drafts = loadForgeDrafts();
  const draft = drafts.find((item) => item.id === draftId);
  if (!draft) {
    hideDraftContextMenu();
    renderDraftList();
    return;
  }
  hideDraftContextMenu();
  if (!window.confirm(t("forging.draftDeleteConfirm", { name: draft.name || t("forging.draftName", { index: 1 }) }))) return;
  const remaining = drafts.filter((item) => item.id !== draftId);
  writeForgeDrafts(remaining);
  if (activeDraftId === draftId) {
    activeDraftId = "";
    localStorage.removeItem(activeForgeDraftStorageKey);
  }
  renderDraftList();
  setStatus("forging.status.draftDeleted");
}

function loadDraft(draftId) {
  const draft = loadForgeDrafts().find((item) => item.id === draftId);
  if (!draft) {
    setStatus("forging.status.invalidChainCode");
    renderDraftList();
    return;
  }
  if (draft.state ? !loadWorkbenchDraftState(draft.state, draft.code) : !loadForgeCodeToWorkbench(draft.code)) return;
  activeDraftId = draft.id;
  localStorage.setItem(activeForgeDraftStorageKey, activeDraftId);
  renderDraftList();
  setStatus("forging.status.draftLoaded");
}

function serializeWorkbenchDraft() {
  return {
    version: 1,
    selectedIndex: Math.max(0, pieces.indexOf(selectedPiece)),
    pieces: pieces.map(serializeDraftPiece),
  };
}

function serializeDraftPiece(piece) {
  const base = {
    resourceId: piece.resourceId,
    materialIds: [...(piece.materialIds ?? [])],
    backpackMaterialEntryKey: piece.backpackMaterialEntryKey ?? null,
    backpackMaterialEntryKeys: [...(piece.backpackMaterialEntryKeys ?? [])],
    role: piece.role,
    color: `#${piece.color?.getHexString?.() ?? "ffffff"}`,
    heat: piece.heat,
    mass: piece.mass,
    baseMass: piece.baseMass,
    densityKgM3: piece.densityKgM3,
    hardness: piece.hardness,
    dims: vectorToArray(piece.dims),
    offset: vectorToArray(piece.offset),
  };
  if (piece.components) {
    return {
      ...base,
      components: piece.components.map(serializeDraftComponent),
    };
  }
  if (piece.appearance) {
    return {
      ...base,
      appearance: serializeDraftAppearance(piece.appearance),
      grid: { ...piece.grid },
      solid: Array.from(piece.solid),
      gripOffset: piece.gripOffset ? vectorToArray(piece.gripOffset) : null,
      gripNormal: piece.gripNormal ? vectorToArray(piece.gripNormal) : null,
      gripAngle: piece.gripAngle ?? 0,
    };
  }
  return {
    ...base,
    grid: { ...piece.grid },
    solid: Array.from(piece.solid),
    gripOffset: piece.gripOffset ? vectorToArray(piece.gripOffset) : null,
    gripNormal: piece.gripNormal ? vectorToArray(piece.gripNormal) : null,
    gripAngle: piece.gripAngle ?? 0,
  };
}

function serializeDraftAppearance(appearance) {
  return {
    dims: vectorToArray(appearance.dims),
    grid: { ...(appearance.grid ?? appearanceGrid) },
    quads: (appearance.quads ?? []).map((quad) => ({ ...quad })),
    gripOffset: appearance.gripOffset ? vectorToArray(appearance.gripOffset) : null,
    gripNormal: appearance.gripNormal ? vectorToArray(appearance.gripNormal) : null,
    gripAngle: appearance.gripAngle ?? 0,
  };
}

function serializeDraftComponent(component) {
  return {
    resourceId: component.resourceId,
    materialIds: [...(component.materialIds ?? [])],
    backpackMaterialEntryKey: component.backpackMaterialEntryKey ?? null,
    backpackMaterialEntryKeys: [...(component.backpackMaterialEntryKeys ?? [])],
    role: component.role,
    color: `#${component.color?.getHexString?.() ?? "ffffff"}`,
    baseMass: component.baseMass,
    densityKgM3: component.densityKgM3,
    dims: vectorToArray(component.dims),
    offset: vectorToArray(component.offset),
    grid: { ...component.grid },
    solid: Array.from(component.solid),
    gripOffset: component.gripOffset ? vectorToArray(component.gripOffset) : null,
    gripNormal: component.gripNormal ? vectorToArray(component.gripNormal) : null,
    gripAngle: component.gripAngle ?? 0,
  };
}

function vectorToArray(vector) {
  return [vector.x, vector.y, vector.z];
}

function loadWorkbenchDraftState(state, fallbackCode = "") {
  if (!state || !Array.isArray(state.pieces) || !state.pieces.length) {
    if (fallbackCode) return loadForgeCodeToWorkbench(fallbackCode);
    setStatus("forging.status.invalidChainCode");
    return false;
  }

  clearWorkbench();
  currentChainCode = fallbackCode || "";
  chainCodeOutput.value = currentChainCode;
  for (const snapshot of state.pieces) {
    const piece = createPieceFromDraft(snapshot);
    pieces.push(piece);
    selectableMeshes.push(piece.mesh);
    scene.add(piece.mesh, piece.edges);
    updatePiece(piece);
  }
  const selectedIndex = Number.isInteger(state.selectedIndex) ? THREE.MathUtils.clamp(state.selectedIndex, 0, pieces.length - 1) : 0;
  selectPiece(pieces[selectedIndex]);
  selectTool("gloves");
  syncUsedBackpackMaterialEntriesFromWorkbench();
  updateHud();
  return true;
}

function castWorkbench() {
  if (!pieces.length) {
    setStatus("forging.status.empty");
    return;
  }
  if (!workbenchPiecesAreConnected(pieces)) {
    setStatus("forging.status.castDisconnected");
    return;
  }

  const castPiece = createCastPieceFromPieces(pieces);
  currentChainCode = encodeForgeCode(forgeBlueprintFromPieces([castPiece]));
  chainCodeOutput.value = currentChainCode;

  for (const piece of [...pieces]) {
    scene.remove(piece.mesh, piece.edges);
    disposePiece(piece);
  }
  pieces.length = 0;
  selectableMeshes.length = 0;
  pieces.push(castPiece);
  selectableMeshes.push(castPiece.mesh);
  scene.add(castPiece.mesh, castPiece.edges);
  selectPiece(castPiece);
  selectTool("gloves");
  syncUsedBackpackMaterialEntriesFromWorkbench();
  setStatus("forging.status.castComplete");
  updatePiece(castPiece);
  updateHud();
}

function createCastPieceFromPieces(sourcePieces) {
  const bounds = localBoundsForPieces(sourcePieces);
  const castOffset = bounds.getCenter(new THREE.Vector3());
  const castComponents = [];
  const materialIds = [];
  const materialMass = new Map();
  let heat = 0;
  let baseMass = 0;
  let hardness = 0.5;

  for (const piece of sourcePieces) {
    heat += piece.heat ?? 0;
    for (const component of componentsFromPiece(piece)) {
      const resourceId = component.resourceId ?? piece.resourceId ?? "iron";
      for (const materialId of component.materialIds?.length ? component.materialIds : [resourceId]) {
        if (!materialIds.includes(materialId)) materialIds.push(materialId);
      }
      const componentMass = componentMassKg(component);
      baseMass += componentMass;
      materialMass.set(resourceId, (materialMass.get(resourceId) ?? 0) + componentMass);
      castComponents.push(cloneComponentForCast(piece, component, castOffset));
    }
    hardness = Math.max(hardness, piece.hardness ?? 0.5);
  }
  const primaryResourceId = primaryMaterialId(materialMass);
  const backpackMaterialEntryKeys = [...new Set(sourcePieces.flatMap(backpackMaterialEntryKeysForPiece))];

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.68,
    metalness: 0.45,
  });
  const mesh = new THREE.Mesh(emptyGeometry.clone(), material);
  const edges = new THREE.LineSegments(
    emptyGeometry.clone(),
    new THREE.LineBasicMaterial({ color: 0xffe0a1, transparent: true, opacity: 0.65 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.pieceId = nextPieceId;
  edges.userData.pieceId = nextPieceId;

  const castPiece = {
    id: nextPieceId++,
    resourceId: primaryResourceId,
    materialIds,
    backpackMaterialEntryKeys,
    color: new THREE.Color(0xffffff),
    heat: sourcePieces.length ? heat / sourcePieces.length : 0,
    mass: 0,
    baseMass,
    densityKgM3: weightedDensityForComponents(castComponents),
    hardness,
    dims: bounds.getSize(new THREE.Vector3()),
    offset: castOffset,
    components: castComponents,
    grid: { ...appearanceGrid },
    solid: createSolidVoxels(appearanceGrid),
    gripOffset: gripOffsetForPieces(sourcePieces, castOffset),
    gripNormal: gripNormalForPieces(sourcePieces),
    gripAngle: gripAngleForPieces(sourcePieces),
    mesh,
    edges,
  };
  refreshPieceGeometry(castPiece);
  return castPiece;
}

function cloneComponentForCast(piece, component, castOffset) {
  const resourceId = component.resourceId ?? piece.resourceId ?? "iron";
  const worldComponentOffset = piece.offset.clone().add(component.offset ?? new THREE.Vector3());
  const color = component.color?.clone?.()
    ?? piece.color?.clone?.()
    ?? new THREE.Color(resources[resourceId]?.color ?? resources.iron.color);
  return {
    resourceId,
    materialIds: [...(component.materialIds?.length ? component.materialIds : piece.materialIds ?? [resourceId])],
    backpackMaterialEntryKey: component.backpackMaterialEntryKey ?? piece.backpackMaterialEntryKey ?? null,
    backpackMaterialEntryKeys: [...(component.backpackMaterialEntryKeys ?? [])],
    role: component.role ?? piece.role ?? resources[resourceId]?.role,
    color,
    baseMass: componentFullMassKg(component),
    densityKgM3: component.densityKgM3 ?? piece.densityKgM3 ?? materialDensityForIds(component.materialIds ?? piece.materialIds, resourceId),
    dims: component.dims.clone(),
    offset: worldComponentOffset.sub(castOffset),
    grid: { ...component.grid },
    solid: new Uint8Array(component.solid),
    gripOffset: component.gripOffset?.clone?.().add(piece.offset).sub(castOffset) ?? null,
    gripNormal: component.gripNormal?.clone?.() ?? null,
    gripAngle: component.gripAngle ?? 0,
  };
}

function createAppearanceBlueprintFromPieces(sourcePieces, origin) {
  const bounds = localBoundsForPieces(sourcePieces);
  const dims = bounds.getSize(new THREE.Vector3());
  const solid = new Uint8Array(appearanceGrid.x * appearanceGrid.y * appearanceGrid.z);
  const material = new Uint16Array(solid.length);
  const palette = [];
  const paletteIndexes = new Map();
  const cell = new THREE.Vector3(
    dims.x / appearanceGrid.x,
    dims.y / appearanceGrid.y,
    dims.z / appearanceGrid.z,
  );

  for (let z = 0; z < appearanceGrid.z; z++) {
    for (let y = 0; y < appearanceGrid.y; y++) {
      for (let x = 0; x < appearanceGrid.x; x++) {
        const point = new THREE.Vector3(
          bounds.min.x + (x + 0.5) * cell.x,
          bounds.min.y + (y + 0.5) * cell.y,
          bounds.min.z + (z + 0.5) * cell.z,
        );
        const hit = materialAtPoint(sourcePieces, point);
        if (!hit) continue;
        const index = voxelIndex(appearanceGrid, x, y, z);
        solid[index] = 1;
        material[index] = appearancePaletteIndex(palette, paletteIndexes, hit);
      }
    }
  }

  return {
    dims,
    grid: { ...appearanceGrid },
    quads: buildAppearanceQuads(solid, material, appearanceGrid, palette),
    gripOffset: gripOffsetForPieces(sourcePieces, origin),
    gripNormal: gripNormalForPieces(sourcePieces),
    gripAngle: gripAngleForPieces(sourcePieces),
  };
}

function materialAtPoint(sourcePieces, point) {
  for (const piece of sourcePieces) {
    for (const component of componentsFromPiece(piece)) {
      if (!componentContainsPoint(piece, component, point)) continue;
      const resourceId = component.resourceId ?? piece.resourceId ?? "iron";
      const color = component.color ?? piece.color ?? new THREE.Color(resources[resourceId]?.color ?? resources.iron.color);
      return {
        resourceId,
        materialIds: [...(component.materialIds?.length ? component.materialIds : piece.materialIds ?? [resourceId])],
        color,
      };
    }
  }
  return null;
}

function appearancePaletteIndex(palette, paletteIndexes, hit) {
  const resourceId = hit.resourceId ?? "iron";
  const color = hit.color instanceof THREE.Color
    ? `#${hit.color.getHexString()}`
    : `#${new THREE.Color(hit.color ?? resources[resourceId]?.color ?? resources.iron.color).getHexString()}`;
  const materialIds = [...(hit.materialIds?.length ? hit.materialIds : [resourceId])];
  const key = `${resourceId}:${color}:${materialIds.join(",")}`;
  const existing = paletteIndexes.get(key);
  if (existing !== undefined) return existing;
  const index = palette.length;
  palette.push({ resourceId, color, materialIds });
  paletteIndexes.set(key, index);
  return index;
}

function componentContainsPoint(piece, component, point) {
  const center = piece.offset.clone().add(component.offset);
  const local = point.clone().sub(center).add(component.dims.clone().multiplyScalar(0.5));
  if (
    local.x < 0 || local.y < 0 || local.z < 0 ||
    local.x >= component.dims.x || local.y >= component.dims.y || local.z >= component.dims.z
  ) return false;
  const x = Math.min(component.grid.x - 1, Math.floor((local.x / component.dims.x) * component.grid.x));
  const y = Math.min(component.grid.y - 1, Math.floor((local.y / component.dims.y) * component.grid.y));
  const z = Math.min(component.grid.z - 1, Math.floor((local.z / component.dims.z) * component.grid.z));
  return component.solid[voxelIndex(component.grid, x, y, z)] === 1;
}

function gripOffsetForPieces(sourcePieces, origin) {
  for (const piece of sourcePieces) {
    for (const component of componentsFromPiece(piece)) {
      if (!component.gripOffset) continue;
      const grip = component.gripOffset
        .clone()
        .add(piece.offset);
      return grip.sub(origin);
    }
  }
  return null;
}

function gripNormalForPieces(sourcePieces) {
  for (const piece of sourcePieces) {
    for (const component of componentsFromPiece(piece)) {
      if (component.gripNormal) return component.gripNormal.clone();
    }
  }
  return null;
}

function gripAngleForPieces(sourcePieces) {
  for (const piece of sourcePieces) {
    for (const component of componentsFromPiece(piece)) {
      if (component.gripOffset) return component.gripAngle ?? 0;
    }
  }
  return 0;
}

function buildAppearanceQuads(solid, material, gridSize, palette = null) {
  const quads = [];
  for (let axis = 0; axis < 3; axis++) {
    collectAppearanceQuadsForSide(quads, solid, material, gridSize, axis, 1, palette);
    collectAppearanceQuadsForSide(quads, solid, material, gridSize, axis, 0, palette);
  }
  return quads;
}

function collectAppearanceQuadsForSide(quads, solid, material, gridSize, axis, side, palette = null) {
  const axisNames = ["x", "y", "z"];
  const uAxis = axis === 0 ? 1 : 0;
  const vAxis = axis === 2 ? 1 : 2;
  const axisSize = gridSize[axisNames[axis]];
  const uSize = gridSize[axisNames[uAxis]];
  const vSize = gridSize[axisNames[vAxis]];
  const coords = [0, 0, 0];

  for (let plane = 0; plane <= axisSize; plane++) {
    const mask = new Int16Array(uSize * vSize);
    for (let v = 0; v < vSize; v++) {
      for (let u = 0; u < uSize; u++) {
        coords[uAxis] = u;
        coords[vAxis] = v;
        const insideCoord = side ? plane - 1 : plane;
        const outsideCoord = side ? plane : plane - 1;
        coords[axis] = insideCoord;
        const inside = appearanceCellValue(solid, material, gridSize, coords[0], coords[1], coords[2]);
        coords[axis] = outsideCoord;
        const outside = appearanceCellValue(solid, material, gridSize, coords[0], coords[1], coords[2]);
        if (inside > 0 && outside === 0) mask[u + uSize * v] = inside;
      }
    }
      greedyMaskToQuads(quads, mask, uSize, vSize, axis, side, plane, palette);
  }
}

function appearanceCellValue(solid, material, gridSize, x, y, z) {
  if (x < 0 || y < 0 || z < 0 || x >= gridSize.x || y >= gridSize.y || z >= gridSize.z) return 0;
  const index = voxelIndex(gridSize, x, y, z);
  return solid[index] ? material[index] + 1 : 0;
}

function greedyMaskToQuads(quads, mask, width, height, axis, side, plane, palette = null) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = mask[x + width * y];
      if (!value) continue;
      let runWidth = 1;
      while (x + runWidth < width && mask[x + runWidth + width * y] === value) runWidth++;
      let runHeight = 1;
      outer:
      while (y + runHeight < height) {
        for (let dx = 0; dx < runWidth; dx++) {
          if (mask[x + dx + width * (y + runHeight)] !== value) break outer;
        }
        runHeight++;
      }
      for (let dy = 0; dy < runHeight; dy++) {
        for (let dx = 0; dx < runWidth; dx++) mask[x + dx + width * (y + dy)] = 0;
      }
      const paletteEntry = palette?.[value - 1] ?? null;
      quads.push({
        axis,
        side,
        plane,
        u0: x,
        u1: x + runWidth,
        v0: y,
        v1: y + runHeight,
        resourceId: paletteEntry?.resourceId ?? resourceIds[value - 1] ?? "iron",
        color: paletteEntry?.color ?? null,
        materialIds: paletteEntry?.materialIds ? [...paletteEntry.materialIds] : [],
      });
    }
  }
}

function primaryMaterialId(materialMass) {
  let bestId = "iron";
  let bestMass = -Infinity;
  for (const [resourceId, mass] of materialMass) {
    if (mass > bestMass) {
      bestId = resourceId;
      bestMass = mass;
    }
  }
  return bestId;
}

function componentsFromPiece(piece) {
  if (piece.components) return piece.components;
  return [{
    resourceId: piece.resourceId,
    materialIds: [...(piece.materialIds ?? [])],
    role: piece.role,
    color: piece.color,
    baseMass: piece.baseMass,
    densityKgM3: piece.densityKgM3,
    dims: piece.dims,
    offset: new THREE.Vector3(),
    grid: piece.grid,
    solid: piece.solid,
    gripOffset: piece.gripOffset?.clone?.() ?? null,
    gripNormal: piece.gripNormal?.clone?.() ?? null,
    gripAngle: piece.gripAngle ?? 0,
  }];
}

function localBoundsForPieces(sourcePieces) {
  const bounds = new THREE.Box3();
  for (const piece of sourcePieces) {
    for (const component of componentsFromPiece(piece)) {
      const center = piece.offset.clone().add(component.offset);
      const half = component.dims.clone().multiplyScalar(0.5);
      bounds.union(new THREE.Box3(center.clone().sub(half), center.clone().add(half)));
    }
  }
  return bounds;
}

function openChainCodeModal() {
  ensureCurrentChainCode();
  if (!currentChainCode) setStatus("forging.status.noChainCode");
  chainModal.classList.add("open");
  chainModal.setAttribute("aria-hidden", "false");
  chainCodeOutput.focus();
  chainCodeOutput.select();
}

function ensureCurrentChainCode() {
  if (!pieces.length) return;
  currentChainCode = encodeForgeCode(forgeBlueprintFromPieces(pieces));
  chainCodeOutput.value = currentChainCode;
}

function closeChainCodeModal() {
  chainModal.classList.remove("open");
  chainModal.setAttribute("aria-hidden", "true");
}

function generateFromChainCode() {
  const code = chainCodeOutput.value.trim();
  if (!code) {
    setStatus("forging.status.noChainCode");
    return;
  }

  if (!loadForgeCodeToWorkbench(code)) return;
  closeChainCodeModal();
  setStatus("forging.status.chainLoaded");
}

function loadForgeCodeToWorkbench(code) {
  let blueprint;
  try {
    blueprint = decodeForgeCode(code);
  } catch (_error) {
    setStatus("forging.status.invalidChainCode");
    return false;
  }

  if (blueprint.appearance) {
    clearWorkbench();
    currentChainCode = code;
    const piece = createPieceFromAppearance(blueprint.appearance);
    pieces.push(piece);
    selectableMeshes.push(piece.mesh);
    scene.add(piece.mesh, piece.edges);
    updatePiece(piece);
    selectPiece(piece);
    selectTool("gloves");
    updateHud();
    return true;
  }

  if (!blueprint.components?.length) {
    setStatus("forging.status.invalidChainCode");
    return false;
  }

  clearWorkbench();
  currentChainCode = code;
  for (const component of blueprint.components) {
    const piece = createPieceFromComponent(component);
    pieces.push(piece);
    selectableMeshes.push(piece.mesh);
    scene.add(piece.mesh, piece.edges);
    updatePiece(piece);
  }
  selectPiece(pieces[0]);
  selectTool("gloves");
  updateHud();
  return true;
}

function forgeBlueprintFromPieces(sourcePieces) {
  if (sourcePieces.length === 1 && sourcePieces[0].appearance) {
    return { version: forgeAppearanceVersion, appearance: sourcePieces[0].appearance };
  }
  const bounds = localBoundsForPieces(sourcePieces);
  const origin = bounds.getCenter(new THREE.Vector3());
  const components = [];
  for (const piece of sourcePieces) {
    for (const component of componentsFromPiece(piece)) {
      components.push({
        resourceId: component.resourceId ?? piece.resourceId ?? "iron",
        role: component.role ?? piece.role ?? resources[component.resourceId ?? piece.resourceId]?.role,
        dims: component.dims.clone(),
        offset: component.offset.clone().add(piece.offset).sub(origin),
        grid: { ...component.grid },
        solid: new Uint8Array(component.solid),
        gripOffset: component.gripOffset?.clone?.().add(piece.offset).sub(origin) ?? null,
        gripNormal: component.gripNormal?.clone?.() ?? null,
        gripAngle: component.gripAngle ?? 0,
      });
    }
  }
  return { version: 2, components };
}

function encodeForgeCode(blueprint) {
  return forgeBytesToCode(encodeForgeBytes(blueprint));
}

function encodeForgeBytes(blueprint) {
  const writer = new BitWriter();
  writer.write(blueprint.version, 4);
  if (blueprint.version === forgeAppearanceVersion && blueprint.appearance) {
    writeAppearanceBlueprint(writer, blueprint.appearance);
    return writer.bytes();
  }
  writer.write(Math.min(31, blueprint.components.length), 5);
  for (const component of blueprint.components.slice(0, 31)) {
    writer.write(Math.max(0, resourceIds.indexOf(component.resourceId)), 3);
    writeQuantizedUnsigned(writer, component.dims.x, 8, 64);
    writeQuantizedUnsigned(writer, component.dims.y, 8, 64);
    writeQuantizedUnsigned(writer, component.dims.z, 8, 64);
    writeQuantizedSigned(writer, component.offset.x, 10, 64);
    writeQuantizedSigned(writer, component.offset.y, 10, 64);
    writeQuantizedSigned(writer, component.offset.z, 10, 64);
    writer.write(component.gripOffset ? 1 : 0, 1);
    if (component.gripOffset) {
      writeQuantizedSigned(writer, component.gripOffset.x, 10, 64);
      writeQuantizedSigned(writer, component.gripOffset.y, 10, 64);
      writeQuantizedSigned(writer, component.gripOffset.z, 10, 64);
    }
    writeSolidRuns(writer, component.solid);
  }
  return writer.bytes();
}

function writeAppearanceBlueprint(writer, appearance) {
  writeQuantizedUnsigned(writer, appearance.dims.x, 9, 32);
  writeQuantizedUnsigned(writer, appearance.dims.y, 9, 32);
  writeQuantizedUnsigned(writer, appearance.dims.z, 9, 32);
  writer.write(appearance.gripOffset ? 1 : 0, 1);
  if (appearance.gripOffset) {
    writeQuantizedSigned(writer, appearance.gripOffset.x, 11, 64);
    writeQuantizedSigned(writer, appearance.gripOffset.y, 11, 64);
    writeQuantizedSigned(writer, appearance.gripOffset.z, 11, 64);
  }
  const quads = (appearance.quads ?? []).slice(0, 4095);
  writer.write(quads.length, 12);
  const coordinatePalette = coordinatePaletteForQuads(quads);
  const usePalette = shouldUseCoordinatePalette(quads, coordinatePalette);
  writer.write(usePalette ? 1 : 0, 1);
  if (usePalette) {
    writer.write(coordinatePalette.length, 5);
    for (const value of coordinatePalette) writer.write(value, 5);
  }
  for (const quad of quads) writeCompressedAppearanceQuad(writer, quad, usePalette ? coordinatePalette : null);
}

function writeCompressedAppearanceQuad(writer, quad, coordinatePalette = null) {
  const fullU = quad.u0 === 0 && quad.u1 === appearanceGrid.x;
  const fullV = quad.v0 === 0 && quad.v1 === appearanceGrid.x;
  if (fullU && fullV) {
    writer.write(0, 1);
    writeAppearanceQuadHeader(writer, quad, coordinatePalette);
    return;
  }
  if (fullU || fullV) {
    writer.write(2, 2);
    writeAppearanceQuadHeader(writer, quad, coordinatePalette);
    writer.write(fullU ? 1 : 0, 1);
    writeAppearanceCoord(writer, fullU ? quad.v0 : quad.u0, coordinatePalette);
    writeAppearanceCoord(writer, fullU ? quad.v1 : quad.u1, coordinatePalette);
    return;
  }
  writer.write(3, 2);
  writeAppearanceQuadHeader(writer, quad, coordinatePalette);
  writeAppearanceCoord(writer, quad.u0, coordinatePalette);
  writeAppearanceCoord(writer, quad.u1, coordinatePalette);
  writeAppearanceCoord(writer, quad.v0, coordinatePalette);
  writeAppearanceCoord(writer, quad.v1, coordinatePalette);
}

function writeAppearanceQuadHeader(writer, quad, coordinatePalette = null) {
  writer.write(quad.axis, 2);
  writer.write(quad.side ? 1 : 0, 1);
  writer.write(Math.max(0, resourceIds.indexOf(quad.resourceId)), 3);
  writeAppearanceCoord(writer, quad.plane, coordinatePalette);
}

function writeAppearanceCoord(writer, value, coordinatePalette = null) {
  if (!coordinatePalette) {
    writer.write(THREE.MathUtils.clamp(value, 0, 31), 5);
    return;
  }
  const index = coordinatePalette.indexOf(THREE.MathUtils.clamp(value, 0, 31));
  writer.write(Math.max(0, index), bitsForPalette(coordinatePalette));
}

function coordinatePaletteForQuads(quads) {
  const values = new Set();
  for (const quad of quads) {
    values.add(THREE.MathUtils.clamp(quad.plane, 0, 31));
    values.add(THREE.MathUtils.clamp(quad.u0, 0, 31));
    values.add(THREE.MathUtils.clamp(quad.u1, 0, 31));
    values.add(THREE.MathUtils.clamp(quad.v0, 0, 31));
    values.add(THREE.MathUtils.clamp(quad.v1, 0, 31));
  }
  return [...values].sort((a, b) => a - b).slice(0, 31);
}

function shouldUseCoordinatePalette(quads, coordinatePalette) {
  if (!coordinatePalette.length) return false;
  const directBits = 1 + quads.reduce((sum, quad) => sum + compressedQuadBits(quad, 5), 0);
  const paletteBits = 1 + 5 + coordinatePalette.length * 5 + quads.reduce((sum, quad) => sum + compressedQuadBits(quad, bitsForPalette(coordinatePalette)), 0);
  return paletteBits < directBits;
}

function compressedQuadBits(quad, coordBits) {
  const fullU = quad.u0 === 0 && quad.u1 === appearanceGrid.x;
  const fullV = quad.v0 === 0 && quad.v1 === appearanceGrid.x;
  const headerBits = 2 + 1 + 3 + coordBits;
  if (fullU && fullV) return 1 + headerBits;
  if (fullU || fullV) return 2 + headerBits + 1 + coordBits * 2;
  return 2 + headerBits + coordBits * 4;
}

function bitsForPalette(coordinatePalette) {
  return Math.max(1, Math.ceil(Math.log2(Math.max(1, coordinatePalette.length))));
}

function decodeForgeCode(codeOrBytes) {
  const reader = new BitReader(forgeCodeToBytes(codeOrBytes));
  const version = reader.read(4);
  if (version === legacyAppearanceVersion || version === forgeAppearanceVersion) return readAppearanceBlueprint(reader, version);
  const componentCount = reader.read(5);
  const components = [];
  for (let index = 0; index < componentCount; index++) {
    const resourceId = resourceIds[reader.read(3)] ?? "iron";
    const dims = new THREE.Vector3(
      readQuantizedUnsigned(reader, 8, 64),
      readQuantizedUnsigned(reader, 8, 64),
      readQuantizedUnsigned(reader, 8, 64),
    );
    const offset = new THREE.Vector3(
      readQuantizedSigned(reader, 10, 64),
      readQuantizedSigned(reader, 10, 64),
      readQuantizedSigned(reader, 10, 64),
    );
    const hasGripOffset = version >= 2 && reader.read(1) === 1;
    const gripOffset = hasGripOffset
      ? new THREE.Vector3(
          readQuantizedSigned(reader, 10, 64),
          readQuantizedSigned(reader, 10, 64),
          readQuantizedSigned(reader, 10, 64),
        )
      : null;
    components.push({
      resourceId,
      role: gripOffset ? "grip" : resources[resourceId]?.role,
      dims,
      offset,
      grid: { ...voxelGrid },
      gripOffset,
      solid: readSolidRuns(reader, voxelGrid.x * voxelGrid.y * voxelGrid.z),
    });
  }
  return { version, components };
}

function readAppearanceBlueprint(reader, version) {
  const dims = new THREE.Vector3(
    readQuantizedUnsigned(reader, 9, 32),
    readQuantizedUnsigned(reader, 9, 32),
    readQuantizedUnsigned(reader, 9, 32),
  );
  const hasGripOffset = reader.read(1) === 1;
  const gripOffset = hasGripOffset
    ? new THREE.Vector3(
        readQuantizedSigned(reader, 11, 64),
        readQuantizedSigned(reader, 11, 64),
        readQuantizedSigned(reader, 11, 64),
      )
    : null;
  const quadCount = reader.read(12);
  const quads = [];
  let coordinatePalette = null;
  if (version !== legacyAppearanceVersion && reader.read(1) === 1) {
    const coordinateCount = reader.read(5);
    coordinatePalette = [];
    for (let index = 0; index < coordinateCount; index++) coordinatePalette.push(reader.read(5));
  }
  for (let index = 0; index < quadCount; index++) {
    quads.push(version === legacyAppearanceVersion ? readLegacyAppearanceQuad(reader) : readCompressedAppearanceQuad(reader, coordinatePalette));
  }
  return {
    version,
    appearance: {
      dims,
      grid: { ...appearanceGrid },
      quads,
      gripOffset,
    },
  };
}

function readLegacyAppearanceQuad(reader) {
  return {
    axis: reader.read(2),
    side: reader.read(1),
    resourceId: resourceIds[reader.read(3)] ?? "iron",
    plane: reader.read(5),
    u0: reader.read(5),
    u1: reader.read(5),
    v0: reader.read(5),
    v1: reader.read(5),
  };
}

function readCompressedAppearanceQuad(reader, coordinatePalette = null) {
  if (reader.read(1) === 0) {
    return {
      ...readAppearanceQuadHeader(reader, coordinatePalette),
      u0: 0,
      u1: appearanceGrid.x,
      v0: 0,
      v1: appearanceGrid.x,
    };
  }
  const isGeneral = reader.read(1) === 1;
  const quad = readAppearanceQuadHeader(reader, coordinatePalette);
  if (isGeneral) {
    return {
      ...quad,
      u0: readAppearanceCoord(reader, coordinatePalette),
      u1: readAppearanceCoord(reader, coordinatePalette),
      v0: readAppearanceCoord(reader, coordinatePalette),
      v1: readAppearanceCoord(reader, coordinatePalette),
    };
  }
  const rangeIsV = reader.read(1) === 1;
  const start = readAppearanceCoord(reader, coordinatePalette);
  const end = readAppearanceCoord(reader, coordinatePalette);
  return {
    ...quad,
    u0: rangeIsV ? 0 : start,
    u1: rangeIsV ? appearanceGrid.x : end,
    v0: rangeIsV ? start : 0,
    v1: rangeIsV ? end : appearanceGrid.x,
  };
}

function readAppearanceQuadHeader(reader, coordinatePalette = null) {
  return {
    axis: reader.read(2),
    side: reader.read(1),
    resourceId: resourceIds[reader.read(3)] ?? "iron",
    plane: readAppearanceCoord(reader, coordinatePalette),
  };
}

function readAppearanceCoord(reader, coordinatePalette = null) {
  if (!coordinatePalette) return reader.read(5);
  return coordinatePalette[reader.read(bitsForPalette(coordinatePalette))] ?? 0;
}

function createGeometryFromForgeCode(code) {
  const blueprint = decodeForgeCode(code);
  if (blueprint.appearance) return buildAppearanceGeometry(blueprint.appearance);
  const piece = {
    components: blueprint.components.map((component) => ({
      ...component,
      color: new THREE.Color(resources[component.resourceId]?.color ?? resources.iron.color),
    })),
  };
  return buildCompoundGeometry(piece);
}

function createMeshFromForgeCode(code, materialOptions = {}) {
  const geometry = createGeometryFromForgeCode(code);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.68,
    metalness: 0.45,
    ...materialOptions,
  });
  return new THREE.Mesh(geometry, material);
}

function writeQuantizedUnsigned(writer, value, bits, scale) {
  const max = (1 << bits) - 1;
  writer.write(THREE.MathUtils.clamp(Math.round(value * scale), 0, max), bits);
}

function readQuantizedUnsigned(reader, bits, scale) {
  return reader.read(bits) / scale;
}

function writeQuantizedSigned(writer, value, bits, scale) {
  const maxPositive = (1 << (bits - 1)) - 1;
  const minNegative = -(1 << (bits - 1));
  const quantized = THREE.MathUtils.clamp(Math.round(value * scale), minNegative, maxPositive);
  writer.write(quantized < 0 ? (1 << bits) + quantized : quantized, bits);
}

function readQuantizedSigned(reader, bits, scale) {
  const value = reader.read(bits);
  const sign = 1 << (bits - 1);
  return (value >= sign ? value - (1 << bits) : value) / scale;
}

function writeSolidRuns(writer, solid) {
  const runs = [];
  let current = solid[0] ?? 0;
  let length = 0;
  for (const value of solid) {
    if (value === current && length < 2047) {
      length++;
      continue;
    }
    runs.push(length);
    current = value;
    length = 1;
  }
  runs.push(length);
  writer.write(solid[0] ?? 0, 1);
  writer.write(Math.min(runs.length, 2047), 11);
  for (const run of runs.slice(0, 2047)) writer.write(run, 11);
}

function readSolidRuns(reader, total) {
  const solid = new Uint8Array(total);
  let value = reader.read(1);
  const runCount = reader.read(11);
  let cursor = 0;
  for (let index = 0; index < runCount; index++) {
    const length = reader.read(11);
    solid.fill(value, cursor, Math.min(total, cursor + length));
    cursor += length;
    value = value ? 0 : 1;
  }
  return solid;
}

class BitWriter {
  constructor() {
    this.buffer = [];
    this.current = 0;
    this.bitCount = 0;
  }

  write(value, bits) {
    for (let index = bits - 1; index >= 0; index--) {
      this.current = (this.current << 1) | ((value >> index) & 1);
      this.bitCount++;
      if (this.bitCount === 8) {
        this.buffer.push(this.current);
        this.current = 0;
        this.bitCount = 0;
      }
    }
  }

  bytes() {
    if (this.bitCount > 0) this.buffer.push(this.current << (8 - this.bitCount));
    return new Uint8Array(this.buffer);
  }
}

class BitReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.bitOffset = 0;
  }

  read(bits) {
    let value = 0;
    for (let index = 0; index < bits; index++) {
      const byte = this.bytes[Math.floor(this.bitOffset / 8)] ?? 0;
      const bit = (byte >> (7 - (this.bitOffset % 8))) & 1;
      value = (value << 1) | bit;
      this.bitOffset++;
    }
    return value;
  }
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function forgeBytesToCode(bytes) {
  return `${forgeCodePrefix}${bytesToBase64Url(bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes ?? []))}`;
}

function forgeCodeToBytes(codeOrBytes) {
  if (codeOrBytes instanceof Uint8Array) return new Uint8Array(codeOrBytes);
  if (Array.isArray(codeOrBytes)) return Uint8Array.from(codeOrBytes);
  if (Array.isArray(codeOrBytes?.bytes)) return Uint8Array.from(codeOrBytes.bytes);
  if (codeOrBytes?.bytes instanceof Uint8Array) return new Uint8Array(codeOrBytes.bytes);
  if (typeof codeOrBytes?.code === "string") return forgeCodeToBytes(codeOrBytes.code);
  const encoded = String(codeOrBytes || "").startsWith(forgeCodePrefix)
    ? String(codeOrBytes).slice(forgeCodePrefix.length)
    : String(codeOrBytes || "");
  return base64UrlToBytes(encoded);
}

function base64UrlToBytes(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

window.NicechunkForging = {
  encodeForgeBytes,
  forgeBytesToCode,
  forgeCodeToBytes,
  createGeometryFromForgeCode,
  createMeshFromForgeCode,
  decodeForgeCode,
};

function updatePiece(piece) {
  piece.mesh.position.set(piece.offset.x, workpieceBaseY + piece.offset.y, piece.offset.z);
  piece.edges.position.copy(piece.mesh.position);
  piece.edges.material.opacity = piece === selectedPiece ? 1 : 0.38;
  updateMoveGizmo();
  updateGripBindingMarker();
  markEquipmentPreviewDirty();
}

function selectPiece(piece) {
  selectedPiece = piece;
  for (const item of pieces) {
    item.edges.material.opacity = item === selectedPiece ? 1 : 0.38;
  }
  updateMoveGizmo();
  updateGripBindingMarker();
  updateHud();
}

function pieceFromObject(object) {
  return pieces.find((piece) => piece.id === object.userData.pieceId) || null;
}

function movePiece(piece, nextOffset) {
  if (wouldCollide(piece, nextOffset)) return false;
  piece.offset.copy(nextOffset);
  updatePiece(piece);
  updateHud();
  return true;
}

function wouldCollide(piece, nextOffset) {
  if (staticGeometryOverlap(piece, nextOffset)) return true;
  return wouldCollideWithPieces(piece, nextOffset);
}

function wouldCollideWithPieces(piece, nextOffset) {
  const nextBox = pieceBox(piece, nextOffset);
  return pieces.some((other) => (
    other !== piece &&
    boxesOverlap(nextBox, pieceBox(other, other.offset)) &&
    voxelShapesOverlap(piece, nextOffset, other, other.offset)
  ));
}

function pieceBox(piece, offset) {
  const components = collisionComponents(piece, offset);
  const box = new THREE.Box3();
  for (const component of components) box.union(componentBox(component));
  return box;
}

function collisionComponents(piece, offset) {
  if (piece.components) {
    return piece.components.map((component) => ({
      ...component,
      worldOffset: new THREE.Vector3(
        offset.x + component.offset.x,
        workpieceBaseY + offset.y + component.offset.y,
        offset.z + component.offset.z,
      ),
    }));
  }
  return [{
    dims: piece.dims,
    grid: piece.grid,
    solid: piece.solid,
    solidCells: piece.solidCells ?? solidCellsFor(piece),
    worldOffset: new THREE.Vector3(offset.x, workpieceBaseY + offset.y, offset.z),
  }];
}

function voxelShapesOverlap(a, aOffset, b, bOffset) {
  const componentsA = collisionComponents(a, aOffset);
  const componentsB = collisionComponents(b, bOffset);
  for (const componentA of componentsA) {
    const boxA = componentBox(componentA);
    for (const componentB of componentsB) {
      if (!boxesOverlap(boxA, componentBox(componentB))) continue;
      if (componentVoxelsOverlap(componentA, componentB)) return true;
    }
  }
  return false;
}

function componentVoxelsOverlap(a, b) {
  if (componentIsFullySolid(a) && componentIsFullySolid(b)) return true;
  if (componentIsFullySolid(a)) return solidCellsOverlapBox(b, componentBox(a));
  if (componentIsFullySolid(b)) return solidCellsOverlapBox(a, componentBox(b));
  const cellsA = a.solidCells ?? solidCellsFor(a);
  const cellsB = b.solidCells ?? solidCellsFor(b);
  for (const cellA of cellsA) {
    const boxA = voxelCellBox(a, cellA);
    for (const cellB of cellsB) {
      if (boxesOverlap(boxA, voxelCellBox(b, cellB))) return true;
    }
  }
  return false;
}

function componentIsFullySolid(component) {
  if (component.fullSolid !== undefined) return Boolean(component.fullSolid);
  const cells = component.solidCells ?? solidCellsFor(component);
  return cells.length === component.grid.x * component.grid.y * component.grid.z;
}

function solidCellsOverlapBox(component, box) {
  const cells = component.solidCells ?? solidCellsFor(component);
  for (const cell of cells) {
    if (boxesOverlap(voxelCellBox(component, cell), box)) return true;
  }
  return false;
}

function staticGeometryOverlap(piece, offset) {
  for (const component of collisionComponents(piece, offset)) {
    if (componentIsFullySolid(component)) {
      const box = componentBox(component);
      if (staticCollisionBoxes.some((staticBox) => boxesOverlap(box, staticBox))) return true;
      continue;
    }
    const cells = component.solidCells ?? solidCellsFor(component);
    for (const cell of cells) {
      const box = voxelCellBox(component, cell);
      for (const staticBox of staticCollisionBoxes) {
        if (boxesOverlap(box, staticBox)) return true;
      }
    }
  }
  return false;
}

function componentBox(component) {
  const center = component.worldOffset;
  const half = component.dims.clone().multiplyScalar(0.5);
  return new THREE.Box3(center.clone().sub(half), center.clone().add(half));
}

function voxelCellBox(component, cell) {
  const [x, y, z] = cell;
  const { dims, grid, worldOffset } = component;
  const cellSize = new THREE.Vector3(dims.x / grid.x, dims.y / grid.y, dims.z / grid.z);
  const min = new THREE.Vector3(
    worldOffset.x - dims.x * 0.5 + x * cellSize.x,
    worldOffset.y - dims.y * 0.5 + y * cellSize.y,
    worldOffset.z - dims.z * 0.5 + z * cellSize.z,
  );
  return new THREE.Box3(min, min.clone().add(cellSize));
}

function boxesOverlap(a, b) {
  const epsilon = 0.0005;
  return (
    a.min.x < b.max.x - epsilon &&
    a.max.x > b.min.x + epsilon &&
    a.min.y < b.max.y - epsilon &&
    a.max.y > b.min.y + epsilon &&
    a.min.z < b.max.z - epsilon &&
    a.max.z > b.min.z + epsilon
  );
}

function boxOverlapsSurfaceXZ(box, surface) {
  const epsilon = 0.0005;
  return (
    box.min.x < surface.maxX - epsilon &&
    box.max.x > surface.minX + epsilon &&
    box.min.z < surface.maxZ - epsilon &&
    box.max.z > surface.minZ + epsilon
  );
}

function updateHud() {
  const piece = selectedPiece;
  const materialNames = piece ? [...new Set(piece.materialIds)]
    .map((id) => materialDisplayName(id))
    .join(" + ") : "";
  materialValue.textContent = materialNames || "-";
  heatValue.textContent = piece ? t("forging.percent", { value: Math.round(piece.heat) }) : t("forging.percent", { value: 0 });
  massValue.textContent = piece ? formatMassKg(piece.mass) : "0 kg";
  const shape = piece
    ? t("forging.shapeValue", {
        x: piece.dims.x.toFixed(2),
        y: piece.dims.y.toFixed(2),
        z: piece.dims.z.toFixed(2),
      })
    : "-";
  shapeValue.textContent = shape;
  shapeText.textContent = shape;
  renderAttributePanel(piece);
}

function renderAttributePanel(piece) {
  if (!attributePanel) return;
  if (!piece) {
    attributePanel.replaceChildren();
    return;
  }
  const header = document.createElement("div");
  header.className = "attribute-panel-head";
  const title = document.createElement("strong");
  title.textContent = t("forging.attributes");
  const detail = document.createElement("span");
  detail.textContent = piece.components?.length
    ? t("forging.componentCount", { count: piece.components.length })
    : t("forging.singleComponent");
  header.append(title, detail);

  const stats = document.createElement("div");
  stats.className = "attribute-grid";
  for (const [label, value] of [
    [t("forging.attributeWeight"), formatMassKg(piece.mass)],
    [t("forging.attributeVolume"), formatVolumeLiters(pieceSolidVolumeM3(piece))],
    [t("forging.attributeDensity"), formatDensityKgM3(pieceWeightedDensityKgM3(piece))],
  ]) {
    const row = document.createElement("div");
    const key = document.createElement("span");
    key.textContent = label;
    const data = document.createElement("b");
    data.textContent = value;
    row.append(key, data);
    stats.append(row);
  }

  const breakdown = document.createElement("div");
  breakdown.className = "attribute-breakdown";
  for (const component of attributeComponentsForPiece(piece).slice(0, 8)) {
    const item = document.createElement("div");
    const name = document.createElement("span");
    name.textContent = materialDisplayName(component.materialIds?.[0] ?? component.resourceId);
    const values = document.createElement("b");
    values.textContent = `${formatMassKg(componentMassKg(component))} · ${formatVolumeLiters(componentSolidVolumeM3(component))}`;
    item.append(name, values);
    breakdown.append(item);
  }

  attributePanel.replaceChildren(header, stats, breakdown);
}

function attributeComponentsForPiece(piece) {
  if (!piece) return [];
  if (piece.components?.length) return piece.components;
  if (piece.appearance) return [];
  return [piece];
}

function markEquipmentPreviewDirty() {
  equipmentPreviewDirty = true;
}

function updateEquipmentPreview() {
  if (!equipmentPreviewDirty) return;
  equipmentPreviewDirty = false;
  try {
    forgeAvatarEquippedMesh = equipPreviewMeshOnAvatar({
      avatar: forgeAvatar,
      mesh: createWorkbenchPreviewMesh(equipmentPreviewSourcePieces()),
      currentMesh: forgeAvatarEquippedMesh,
    });
    previewCode = equipmentPreviewSourcePieces().length ? "workbench" : "";
  } catch (error) {
    console.warn("Failed to update equipment preview", error);
    forgeAvatarEquippedMesh = equipPreviewMeshOnAvatar({
      avatar: forgeAvatar,
      mesh: null,
      currentMesh: forgeAvatarEquippedMesh,
    });
    previewCode = "";
  }
}

function equipmentPreviewSourcePieces() {
  const gripAnchor = (selectedPiece && pieceHasGripBinding(selectedPiece))
    ? selectedPiece
    : pieces.find(pieceHasGripBinding);
  return gripAnchor ? gripPreviewSourcePieces(gripAnchor) : [];
}

function createWorkbenchPreviewMesh(sourcePieces) {
  if (!sourcePieces.length) return null;
  const geometry = createWorkbenchPreviewGeometry(sourcePieces);
  if (!geometry.getAttribute("position")?.count) {
    geometry.dispose();
    return null;
  }
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.68,
    metalness: 0.45,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "equippedForgedItem";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const gripPlacement = previewGripPlacementForPieces(sourcePieces);
  mesh.userData.grip = gripPlacement?.offset ?? null;
  mesh.userData.gripNormal = gripPlacement?.normal ?? null;
  mesh.userData.gripAngle = gripPlacement?.angle ?? 0;
  if (!mesh.userData.grip || !mesh.userData.gripNormal) {
    disposePreviewMesh(mesh);
    return null;
  }
  return mesh;
}

function gripPreviewSourcePieces(piece) {
  if (!piece) return [];
  if (!pieces.includes(piece)) return [piece];
  return connectedWorkbenchPiecesFor(piece);
}

function gripCollisionSourcePieces(piece) {
  return piece ? [piece] : [];
}

function gripCollisionSourcePieceForComponent(parentPiece, component) {
  if (!parentPiece || !component) return null;
  return {
    id: `${parentPiece.id ?? "compound"}:${component.id ?? component.resourceId ?? "component"}`,
    resourceId: component.resourceId ?? parentPiece.resourceId,
    materialIds: [...(component.materialIds ?? parentPiece.materialIds ?? [])],
    role: component.role ?? parentPiece.role,
    color: component.color ?? parentPiece.color,
    baseMass: component.baseMass ?? parentPiece.baseMass,
    densityKgM3: component.densityKgM3 ?? parentPiece.densityKgM3,
    dims: component.dims.clone(),
    offset: (parentPiece.offset ?? new THREE.Vector3()).clone().add(component.offset ?? new THREE.Vector3()),
    grid: { ...component.grid },
    solid: component.solid,
    solidCells: component.solidCells ?? solidCellsFor(component),
    fullSolid: component.fullSolid,
    gripOffset: null,
    gripNormal: null,
    gripAngle: parentPiece.gripAngle ?? component.gripAngle ?? 0,
  };
}

function connectedWorkbenchPiecesFor(seedPiece) {
  if (!pieces.includes(seedPiece)) return seedPiece ? [seedPiece] : [];
  const boxesByPiece = new Map(pieces.map((piece) => [piece, solidWorldCellBoxes(piece)]));
  const connected = new Set([seedPiece]);
  const pending = [seedPiece];
  while (pending.length) {
    const current = pending.shift();
    const currentBoxes = boxesByPiece.get(current) ?? [];
    for (const other of pieces) {
      if (connected.has(other)) continue;
      const otherBoxes = boxesByPiece.get(other) ?? [];
      if (!cellGroupsTouch(currentBoxes, otherBoxes)) continue;
      connected.add(other);
      pending.push(other);
    }
  }
  return pieces.filter((piece) => connected.has(piece));
}

function pieceHasGripBinding(piece) {
  if (!piece) return false;
  if (piece.gripOffset && piece.gripNormal) return true;
  if (piece.appearance?.gripOffset && piece.appearance?.gripNormal) return true;
  return (piece.components ?? []).some((component) => component.gripOffset && component.gripNormal);
}

function createGripFailurePreviewMesh(piece, grip, options = {}) {
  if (!piece || !grip?.localPoint || !grip?.normal) return null;
  const sourcePieces = options.sourcePieces ?? gripCollisionSourcePieces(piece);
  const geometry = createWorkbenchPreviewGeometry(sourcePieces);
  if (!geometry.getAttribute("position")?.count) {
    geometry.dispose();
    return null;
  }
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.68,
    metalness: 0.45,
    transparent: true,
    opacity: options.opacity ?? 0.74,
    depthWrite: false,
  });
  if (options.tint) {
    material.color.set(options.tint);
    material.emissive.set(options.tint);
    material.emissiveIntensity = options.emissiveIntensity ?? 0.25;
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = options.name ?? "gripFailurePreview";
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 8;
  const bounds = localBoundsForPieces(sourcePieces);
  const origin = bounds.getCenter(new THREE.Vector3());
  mesh.userData.grip = grip.localPoint.clone().add(piece.offset).sub(origin);
  mesh.userData.gripNormal = grip.normal.clone();
  mesh.userData.gripAngle = grip.angle ?? 0;
  return mesh;
}

function playGripFailureDropAnimation(piece, grip) {
  const { rightArm } = forgeAvatar?.userData?.limbs ?? {};
  if (!rightArm || !piece || !grip) return;
  const mesh = createGripFailurePreviewMesh(piece, grip, { sourcePieces: grip.sourcePieces });
  if (!mesh) return;
  const equipped = equipPreviewMeshOnAvatar({
    avatar: forgeAvatar,
    mesh,
    currentMesh: null,
  });
  if (!equipped) return;
  gripFailureAnimations.push({
    mesh: equipped,
    phase: "held",
    elapsed: 0,
    heldDuration: 0.18,
    fallDuration: 1.05,
    fadeDuration: 0.46,
    targetY: -0.68,
    velocity: new THREE.Vector3(0.18, -0.22, 0.1),
    angularVelocity: new THREE.Vector3(2.4, 3.1, 1.5),
    material: equipped.material,
  });
}

function playGripCollisionFailureAnimation(piece, grip) {
  const mesh = createGripFailurePreviewMesh(piece, grip, { opacity: 0.84, sourcePieces: grip?.sourcePieces });
  if (mesh) {
    const equipped = equipPreviewMeshOnAvatar({
      avatar: forgeAvatar,
      mesh,
      currentMesh: null,
    });
    if (equipped) {
      gripCollisionAttemptAnimations.push({
        mesh: equipped,
        elapsed: 0,
        holdDuration: 0.36,
        fadeDuration: 0.42,
        baseOpacity: 0.84,
      });
    }
  }
  playGripCollisionFlashAnimation(grip?.collision);
}

function updateGripFailureAnimations(dt) {
  for (let index = gripFailureAnimations.length - 1; index >= 0; index--) {
    const animation = gripFailureAnimations[index];
    const mesh = animation.mesh;
    if (!mesh) {
      gripFailureAnimations.splice(index, 1);
      continue;
    }
    animation.elapsed += Math.min(dt, 1 / 30);
    if (animation.phase === "held") {
      const pulse = 1 + Math.sin(animation.elapsed * 24) * 0.025;
      mesh.scale.setScalar(pulse);
      if (animation.elapsed >= animation.heldDuration) {
        mesh.updateMatrixWorld(true);
        scene.attach(mesh);
        animation.phase = "fall";
        animation.elapsed = 0;
      }
      continue;
    }
    if (animation.phase === "fall") {
      animation.velocity.y -= 4.8 * dt;
      mesh.position.addScaledVector(animation.velocity, dt);
      mesh.rotation.x += animation.angularVelocity.x * dt;
      mesh.rotation.y += animation.angularVelocity.y * dt;
      mesh.rotation.z += animation.angularVelocity.z * dt;
      const targetY = animation.targetY ?? forgeTopY + 0.04;
      if (mesh.position.y <= targetY || animation.elapsed >= animation.fallDuration) {
        mesh.position.y = Math.max(mesh.position.y, targetY);
        animation.phase = "fade";
        animation.elapsed = 0;
      }
      continue;
    }
    const opacity = THREE.MathUtils.clamp(0.74 * (1 - animation.elapsed / animation.fadeDuration), 0, 0.74);
    setMeshOpacity(mesh, opacity);
    mesh.scale.multiplyScalar(1 - Math.min(dt * 0.9, 0.08));
    if (animation.elapsed >= animation.fadeDuration) {
      mesh.parent?.remove(mesh);
      disposePreviewMesh(mesh);
      gripFailureAnimations.splice(index, 1);
    }
  }
}

function setMeshOpacity(mesh, opacity) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) {
    if (!material) continue;
    material.transparent = true;
    material.opacity = opacity;
    material.depthWrite = false;
  }
}

function updateGripCollisionAttemptAnimations(dt) {
  for (let index = gripCollisionAttemptAnimations.length - 1; index >= 0; index--) {
    const animation = gripCollisionAttemptAnimations[index];
    const mesh = animation.mesh;
    if (!mesh) {
      gripCollisionAttemptAnimations.splice(index, 1);
      continue;
    }
    animation.elapsed += Math.min(dt, 1 / 30);
    const fadeElapsed = Math.max(0, animation.elapsed - animation.holdDuration);
    const fadeProgress = THREE.MathUtils.clamp(fadeElapsed / animation.fadeDuration, 0, 1);
    const pulse = 1 + Math.sin(animation.elapsed * 26) * 0.012 * (1 - fadeProgress);
    mesh.scale.setScalar(pulse);
    setMeshOpacity(mesh, animation.baseOpacity * (1 - fadeProgress));
    if (fadeProgress >= 1) {
      mesh.parent?.remove(mesh);
      disposePreviewMesh(mesh);
      gripCollisionAttemptAnimations.splice(index, 1);
    }
  }
}

function playGripCollisionFlashAnimation(collision) {
  clearGripCollisionFeedback();
  const patches = (collision?.collisions ?? [])
    .map((entry) => collisionPatchFromSummary(entry.collisionPatch))
    .filter(Boolean);
  if (!patches.length) return;
  for (const patch of patches) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xff2f2f,
      transparent: true,
      opacity: 0.62,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(patch.size.x, patch.size.y, patch.size.z), material);
    mesh.name = "gripCollisionFlash";
    mesh.position.copy(patch.center);
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(patch.axes[0], patch.axes[1], patch.axes[2]));
    mesh.renderOrder = 20;
    scene.add(mesh);
    gripCollisionFlashAnimations.push({
      mesh,
      material,
      baseScale: mesh.scale.clone(),
      elapsed: 0,
      duration: 0.78,
    });
  }
}

function clearGripCollisionFeedback() {
  for (const animation of gripCollisionFlashAnimations.splice(0)) {
    scene.remove(animation.mesh);
    animation.mesh?.geometry?.dispose?.();
    animation.material?.dispose?.();
  }
  for (const animation of gripCollisionAttemptAnimations.splice(0)) {
    animation.mesh?.parent?.remove(animation.mesh);
    disposePreviewMesh(animation.mesh);
  }
  for (const animation of avatarCollisionPartFlashAnimations.splice(0)) {
    if (animation.mesh && animation.originalMaterial) animation.mesh.material = animation.originalMaterial;
    animation.flashMaterial?.dispose?.();
  }
  clearAvatarCollisionProbeFlash();
}

function updateGripCollisionFlashAnimations(dt) {
  for (let index = gripCollisionFlashAnimations.length - 1; index >= 0; index--) {
    const animation = gripCollisionFlashAnimations[index];
    const mesh = animation.mesh;
    if (!mesh) {
      gripCollisionFlashAnimations.splice(index, 1);
      continue;
    }
    animation.elapsed += Math.min(dt, 1 / 30);
    const progress = THREE.MathUtils.clamp(animation.elapsed / animation.duration, 0, 1);
    const pulse = 1 + Math.sin(progress * Math.PI * 5) * 0.12;
    mesh.scale.copy(animation.baseScale).multiplyScalar(pulse);
    animation.material.opacity = 0.58 * (1 - progress);
    if (progress >= 1) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      animation.material.dispose();
      gripCollisionFlashAnimations.splice(index, 1);
    }
  }
}

function flashAvatarCollisionProbe() {
  clearAvatarCollisionProbeFlash();
  forgeAvatar.traverse((object) => {
    if (!object.isMesh || !object.visible || shouldIgnoreAvatarProbeFlashMesh(object)) return;
    const originalMaterial = object.material;
    const flashMaterial = originalMaterial.clone();
    object.material = flashMaterial;
    avatarCollisionProbeFlashAnimations.push({
      mesh: object,
      originalMaterial,
      flashMaterial,
      originalColor: flashMaterial.color?.clone?.() ?? null,
      originalEmissive: flashMaterial.emissive?.clone?.() ?? null,
      elapsed: 0,
      duration: 0.5,
    });
  });
}

function clearAvatarCollisionProbeFlash() {
  for (const animation of avatarCollisionProbeFlashAnimations.splice(0)) {
    if (animation.mesh && animation.originalMaterial) animation.mesh.material = animation.originalMaterial;
    animation.flashMaterial?.dispose?.();
  }
}

function shouldIgnoreAvatarProbeFlashMesh(object) {
  const ignoredNames = new Set([
    "equippedTool",
    "heldBlock",
    "equippedForgedItem",
    "gripHand",
    "gripFailurePreview",
    "gripCollisionGhost",
    "gripCollisionPosePreview",
    "gripCollisionFlash",
    "faceMarker",
    "gripBindingMarker",
  ]);
  for (let current = object; current; current = current.parent) {
    if (ignoredNames.has(current.name)) return true;
  }
  return false;
}

function updateAvatarCollisionProbeFlashAnimations(dt) {
  const white = new THREE.Color(0xffffff);
  for (let index = avatarCollisionProbeFlashAnimations.length - 1; index >= 0; index--) {
    const animation = avatarCollisionProbeFlashAnimations[index];
    const material = animation.flashMaterial;
    animation.elapsed += Math.min(dt, 1 / 30);
    const progress = THREE.MathUtils.clamp(animation.elapsed / animation.duration, 0, 1);
    const pulse = Math.sin(progress * Math.PI);
    if (material.color && animation.originalColor) {
      material.color.copy(animation.originalColor).lerp(white, pulse * 0.92);
    }
    if (material.emissive) {
      material.emissive.copy(animation.originalEmissive ?? new THREE.Color(0x000000)).lerp(white, pulse * 0.65);
      material.emissiveIntensity = Math.max(material.emissiveIntensity ?? 0, pulse * 1.4);
    }
    if (progress >= 1) {
      animation.mesh.material = animation.originalMaterial;
      material.dispose?.();
      avatarCollisionProbeFlashAnimations.splice(index, 1);
    }
  }
}

function flashAvatarCollisionParts(partNames) {
  const names = new Set(partNames);
  if (!names.size) return;
  const active = new Set(avatarCollisionPartFlashAnimations.map((animation) => animation.mesh));
  forgeAvatar.traverse((object) => {
    if (!object.isMesh || active.has(object)) return;
    if (!names.has(avatarCollisionMeshName(object))) return;
    const originalMaterial = object.material;
    const flashMaterial = originalMaterial.clone();
    object.material = flashMaterial;
    avatarCollisionPartFlashAnimations.push({
      mesh: object,
      originalMaterial,
      flashMaterial,
      originalColor: flashMaterial.color?.clone?.() ?? null,
      originalEmissive: flashMaterial.emissive?.clone?.() ?? null,
      elapsed: 0,
      duration: 0.62,
    });
  });
}

function updateAvatarCollisionPartFlashAnimations(dt) {
  const red = new THREE.Color(0xff2f2f);
  for (let index = avatarCollisionPartFlashAnimations.length - 1; index >= 0; index--) {
    const animation = avatarCollisionPartFlashAnimations[index];
    const material = animation.flashMaterial;
    animation.elapsed += Math.min(dt, 1 / 30);
    const progress = THREE.MathUtils.clamp(animation.elapsed / animation.duration, 0, 1);
    const pulse = Math.sin(progress * Math.PI * 4) * (1 - progress);
    if (material.color && animation.originalColor) {
      material.color.copy(animation.originalColor).lerp(red, Math.max(0, pulse) * 0.85);
    }
    if (material.emissive) {
      material.emissive.copy(animation.originalEmissive ?? new THREE.Color(0x000000)).lerp(red, Math.max(0, pulse) * 0.7);
      material.emissiveIntensity = Math.max(material.emissiveIntensity ?? 0, Math.max(0, pulse) * 0.75);
    }
    if (progress >= 1) {
      animation.mesh.material = animation.originalMaterial;
      material.dispose?.();
      avatarCollisionPartFlashAnimations.splice(index, 1);
    }
  }
}

function box3FromSummary(summary) {
  if (!summary?.min || !summary?.max) return null;
  const box = new THREE.Box3(
    new THREE.Vector3(summary.min.x, summary.min.y, summary.min.z),
    new THREE.Vector3(summary.max.x, summary.max.y, summary.max.z),
  );
  return Number.isFinite(box.min.x + box.min.y + box.min.z + box.max.x + box.max.y + box.max.z) ? box : null;
}

function boxIsRenderable(box) {
  const size = box.getSize(new THREE.Vector3());
  return size.x > 0.001 && size.y > 0.001 && size.z > 0.001;
}

function createWorkbenchPreviewGeometry(sourcePieces) {
  if (sourcePieces.length === 1 && sourcePieces[0].appearance) {
    return buildAppearanceGeometry(sourcePieces[0].appearance);
  }
  const bounds = localBoundsForPieces(sourcePieces);
  const origin = bounds.getCenter(new THREE.Vector3());
  const components = [];
  for (const piece of sourcePieces) {
    for (const component of componentsFromPiece(piece)) {
      components.push({
        ...component,
        materialIds: [...(component.materialIds ?? [])],
        color: (component.color ?? piece.color ?? new THREE.Color(resources[component.resourceId]?.color ?? resources.iron.color)).clone(),
        baseMass: component.baseMass,
        densityKgM3: component.densityKgM3,
        dims: component.dims.clone(),
        offset: component.offset.clone().add(piece.offset).sub(origin),
        grid: { ...component.grid },
        solid: new Uint8Array(component.solid),
        gripOffset: component.gripOffset?.clone?.().add(piece.offset).sub(origin) ?? null,
        gripNormal: component.gripNormal?.clone?.() ?? null,
        gripAngle: component.gripAngle ?? 0,
      });
    }
  }
  return buildCompoundGeometry({ components });
}

function previewGripOffsetForPieces(sourcePieces) {
  if (sourcePieces.length === 1 && sourcePieces[0].appearance) {
    return sourcePieces[0].gripOffset?.clone?.() ?? sourcePieces[0].appearance.gripOffset?.clone?.() ?? null;
  }
  const bounds = localBoundsForPieces(sourcePieces);
  const origin = bounds.getCenter(new THREE.Vector3());
  return gripOffsetForPieces(sourcePieces, origin);
}

function previewGripPlacementForPieces(sourcePieces) {
  if (sourcePieces.length === 1 && sourcePieces[0].appearance) {
    const piece = sourcePieces[0];
    const offset = piece.gripOffset?.clone?.() ?? piece.appearance.gripOffset?.clone?.() ?? null;
    const normal = piece.gripNormal?.clone?.() ?? piece.appearance.gripNormal?.clone?.() ?? null;
    if (!offset || !normal) return null;
    return { offset, normal, angle: piece.gripAngle ?? piece.appearance.gripAngle ?? 0 };
  }
  const bounds = localBoundsForPieces(sourcePieces);
  const origin = bounds.getCenter(new THREE.Vector3());
  for (const piece of sourcePieces) {
    if (piece.gripOffset && piece.gripNormal) {
      return {
        offset: piece.gripOffset.clone().add(piece.offset).sub(origin),
        normal: piece.gripNormal.clone(),
        angle: piece.gripAngle ?? 0,
      };
    }
    for (const component of componentsFromPiece(piece)) {
      if (!component.gripOffset || !component.gripNormal) continue;
      return {
        offset: component.gripOffset.clone().add(piece.offset).sub(origin),
        normal: component.gripNormal.clone(),
        angle: component.gripAngle ?? 0,
      };
    }
  }
  return null;
}

function equipPreviewMeshOnAvatar({ avatar, mesh, currentMesh = null, scale = 1 }) {
  const { rightArm } = avatar?.userData?.limbs ?? {};
  if (!rightArm) {
    disposePreviewMesh(mesh);
    return null;
  }
  if (currentMesh) {
    rightArm.remove(currentMesh);
    disposePreviewMesh(currentMesh);
  }
  if (!mesh) return null;

  const grip = mesh.userData.grip;
  const gripNormal = mesh.userData.gripNormal;
  if (!grip || !gripNormal) {
    disposePreviewMesh(mesh);
    return null;
  }
  mesh.scale.setScalar(scale);
  const gripBasis = gripSurfaceBasis(gripNormal, mesh.userData.gripAngle ?? 0);
  const { handSide, handFront, handApproach } = avatarPalmDownGripBasis();
  const sourceMatrix = new THREE.Matrix4().makeBasis(gripBasis.side, gripBasis.front, gripBasis.approach);
  const targetMatrix = new THREE.Matrix4().makeBasis(handSide, handFront, handApproach);
  mesh.quaternion.setFromRotationMatrix(targetMatrix.multiply(sourceMatrix.invert()));
  const gripOffset = grip.clone().multiplyScalar(scale).applyQuaternion(mesh.quaternion);
  const embeddedAnchor = avatarGripHandAnchor.clone().add(handApproach.clone().multiplyScalar(gripHandEmbedDepth));
  mesh.position.copy(embeddedAnchor).sub(gripOffset);
  rightArm.add(mesh);
  return mesh;
}

function avatarPalmDownGripBasis() {
  const handApproach = new THREE.Vector3(0, 1, 0);
  const handFront = new THREE.Vector3(0, 0, -1);
  const handSide = new THREE.Vector3().crossVectors(handFront, handApproach).normalize();
  return { handSide, handFront, handApproach };
}

function disposePreviewMesh(mesh) {
  if (!mesh) return;
  mesh.geometry?.dispose?.();
  if (Array.isArray(mesh.material)) {
    for (const material of mesh.material) material.dispose?.();
  } else {
    mesh.material?.dispose?.();
  }
}

function updateForgeAvatar() {
  updateEquipmentPreview();
  const elapsed = clock.elapsedTime;
  const idleSwing = Math.sin(elapsed * 1.6) * 0.045;
  const { leftArm, rightArm, leftLeg, rightLeg, head } = forgeAvatar.userData.limbs;
  leftArm.rotation.x = idleSwing;
  rightArm.rotation.z = 0;
  rightArm.rotation.x = -idleSwing;
  leftLeg.rotation.x = -idleSwing * 0.45;
  rightLeg.rotation.x = idleSwing * 0.45;
  head.rotation.x = Math.sin(elapsed * 0.7) * 0.035;
  head.rotation.y = Math.sin(elapsed * 0.5) * 0.025;
  faceForgeAvatarToBench();
}

function faceForgeAvatarToBench() {
  const direction = new THREE.Vector3(0, 0, 0).sub(forgeAvatar.position);
  direction.y = 0;
  if (direction.lengthSq() <= 0.0001) return;
  direction.normalize();
  forgeAvatar.rotation.y = Math.atan2(-direction.x, -direction.z);
}

function createToolSettingsMenu() {
  const menu = document.createElement("div");
  menu.className = "tool-settings-menu";
  menu.hidden = true;
  menu.setAttribute("aria-hidden", "true");
  menu.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-setting]");
    if (!button) return;
    const tool = button.dataset.tool;
    const setting = button.dataset.setting;
    const value = button.dataset.value;
    if (tool === "drill" && setting === "size") toolSettings.drill.size = Number(value);
    renderToolSettingsMenu();
    updateHoveredFace();
  });
  document.body.append(menu);
  return menu;
}

function showToolSettingsMenu(x, y) {
  renderToolSettingsMenu();
  toolSettingsMenu.hidden = false;
  toolSettingsMenu.setAttribute("aria-hidden", "false");
  const rect = toolSettingsMenu.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - rect.width - 8);
  const top = Math.min(y, window.innerHeight - rect.height - 8);
  toolSettingsMenu.style.left = `${Math.max(8, left)}px`;
  toolSettingsMenu.style.top = `${Math.max(8, top)}px`;
}

function createDraftContextMenu() {
  const menu = document.createElement("div");
  menu.className = "forge-context-menu draft-context-menu";
  menu.hidden = true;
  menu.setAttribute("aria-hidden", "true");
  menu.addEventListener("contextmenu", (event) => event.preventDefault());
  menu.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || !activeDraftContextId) return;
    if (button.dataset.draftRename != null) {
      renameDraft(activeDraftContextId);
      return;
    }
    if (button.dataset.draftDelete != null) {
      deleteDraft(activeDraftContextId);
    }
  });
  document.body.append(menu);
  return menu;
}

function renderDraftContextMenu() {
  if (!draftContextMenu) return;
  const title = document.createElement("strong");
  title.textContent = t("forging.draftMenu");
  const renameButton = document.createElement("button");
  renameButton.type = "button";
  renameButton.dataset.draftRename = "";
  renameButton.textContent = t("forging.renameDraft");
  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "danger";
  deleteButton.dataset.draftDelete = "";
  deleteButton.textContent = t("forging.deleteDraft");
  draftContextMenu.replaceChildren(title, renameButton, deleteButton);
}

function showDraftContextMenu(draftId, x, y) {
  if (!draftContextMenu) return;
  activeDraftContextId = draftId;
  renderDraftContextMenu();
  draftContextMenu.hidden = false;
  draftContextMenu.setAttribute("aria-hidden", "false");
  const rect = draftContextMenu.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - rect.width - 8);
  const top = Math.min(y, window.innerHeight - rect.height - 8);
  draftContextMenu.style.left = `${Math.max(8, left)}px`;
  draftContextMenu.style.top = `${Math.max(8, top)}px`;
}

function hideDraftContextMenu() {
  if (!draftContextMenu) return;
  activeDraftContextId = "";
  draftContextMenu.hidden = true;
  draftContextMenu.setAttribute("aria-hidden", "true");
}

function hideToolSettingsMenu() {
  toolSettingsMenu.hidden = true;
  toolSettingsMenu.setAttribute("aria-hidden", "true");
}

function showForgeContextMenu(x, y) {
  if (!forgeContextMenu) return;
  forgeContextMenu.hidden = false;
  forgeContextMenu.setAttribute("aria-hidden", "false");
  const rect = forgeContextMenu.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - rect.width - 8);
  const top = Math.min(y, window.innerHeight - rect.height - 8);
  forgeContextMenu.style.left = `${Math.max(8, left)}px`;
  forgeContextMenu.style.top = `${Math.max(8, top)}px`;
}

function hideForgeContextMenu() {
  if (!forgeContextMenu) return;
  forgeContextMenu.hidden = true;
  forgeContextMenu.setAttribute("aria-hidden", "true");
}

function rotateSawAngle() {
  toolSettings.saw.angle = (toolSettings.saw.angle + 10) % 180;
  setStatus("forging.status.sawReady");
}

function renderToolSettingsMenu() {
  if (!toolSettingsMenu) return;
  const activeTool = drillEnabled ? "drill" : null;
  if (!activeTool) {
    toolSettingsMenu.replaceChildren();
    return;
  }

  const title = document.createElement("strong");
  title.textContent = t("forging.toolMenu.drillTitle");
  const sections = [title];
  sections.push(createMenuSection(
    t("forging.toolMenu.size"),
    toolSizeOptions(),
    "drill",
    "size",
    String(toolSettings.drill.size),
  ));
  toolSettingsMenu.replaceChildren(...sections);
}

function createMenuSection(label, options, tool, setting, activeValue) {
  const section = document.createElement("section");
  const heading = document.createElement("span");
  heading.textContent = label;
  const row = document.createElement("div");
  row.className = "tool-settings-row";
  for (const [value, text] of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.tool = tool;
    button.dataset.setting = setting;
    button.dataset.value = value;
    button.textContent = text;
    button.classList.toggle("active", value === activeValue);
    button.setAttribute("aria-pressed", String(value === activeValue));
    row.append(button);
  }
  section.append(heading, row);
  return section;
}

function toolSizeOptions() {
  return [
    ["1", t("forging.toolMenu.sizeSmall")],
    ["3", t("forging.toolMenu.sizeMedium")],
    ["5", t("forging.toolMenu.sizeLarge")],
  ];
}

function renderToolHotbar() {
  const buttons = tools.map((tool) => {
    const button = document.createElement("button");
    button.className = "tool-slot";
    button.type = "button";
    button.dataset.tool = tool.id;
    button.disabled = Boolean(tool.disabled);
    button.classList.toggle("active", tool.id === selectedTool);
    button.setAttribute("aria-pressed", String(tool.id === selectedTool));
    button.setAttribute("aria-label", `${tool.hotkey}. ${t(tool.key)}`);
    button.title = `${tool.hotkey}. ${t(tool.key)}`;
    button.innerHTML = `
      <span class="tool-hotkey">${tool.hotkey}</span>
      <span class="tool-icon ${tool.id}" aria-hidden="true"></span>
      <span class="tool-name">${t(tool.key)}</span>
    `;
    if (!tool.disabled) button.addEventListener("click", () => selectTool(tool.id));
    return button;
  });
  toolHotbar.replaceChildren(...buttons);
  updateToolMode();
}

function selectTool(toolId) {
  const tool = tools.find((item) => item.id === toolId && !item.disabled);
  if (!tool) return;
  hideForgeContextMenu();
  if (tool.id !== selectedTool) finishShapeToolAction();
  const wasMoving = selectedTool === "gloves";
  selectedTool = tool.id;
  updateToolMode();
  if (wasMoving && selectedTool !== "gloves") settleAllPieces();
  if (selectedTool === "hammer") {
    setStatus("forging.status.hammerReady");
  } else if (selectedTool === "gloves") {
    setStatus("forging.status.glovesReady");
  } else if (selectedTool === "saw") {
    setStatus("forging.status.sawReady");
  } else if (selectedTool === "handDrill") {
    setStatus("forging.status.drillReady");
  } else if (selectedTool === "grip") {
    setStatus("forging.status.gripReady");
  } else {
    setStatus("forging.status.toolPending");
  }
}

function updateToolMode() {
  hammerEnabled = selectedTool === "hammer";
  moveEnabled = selectedTool === "gloves";
  sawEnabled = selectedTool === "saw";
  drillEnabled = selectedTool === "handDrill";
  gripEnabled = selectedTool === "grip";
  hammerModeButton.classList.toggle("active", hammerEnabled);
  hammerModeButton.setAttribute("aria-pressed", String(hammerEnabled));
  toolHotbar.querySelectorAll(".tool-slot").forEach((button) => {
    const active = button.dataset.tool === selectedTool;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (!moveEnabled) {
    activeDrag = null;
  }
  if (!sawEnabled) saw.visible = false;
  if (!drillEnabled) handDrill.visible = false;
  if (!gripEnabled) gripHand.visible = false;
  if (!hammerEnabled) {
    strike = null;
    hammer.visible = false;
  }
  if (sawEnabled || !drillEnabled) {
    hideToolSettingsMenu();
  } else if (!toolSettingsMenu.hidden) {
    renderToolSettingsMenu();
  }
  if (!hammerEnabled && !gripEnabled) {
    faceMarker.visible = false;
    hoveredFace = null;
  }
  canvas.style.cursor = cursorForTool(selectedTool);
  updateMoveGizmo();
}

function updatePointer(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function updateHoveredFace() {
  if (!pieces.length || (!hammerEnabled && !sawEnabled && !drillEnabled && !gripEnabled) || activeDrag) {
    hoveredFace = null;
    faceMarker.visible = false;
    gripHand.visible = false;
    return;
  }
  const target = toolTargetFromPointer({ allowSelectedFallback: false });
  if (!target) {
    hoveredFace = null;
    faceMarker.visible = false;
    gripHand.visible = false;
    return;
  }
  hoveredFace = target;
  placeFaceMarker(target);
}

function placeFaceMarker(target) {
  const { piece, localPoint, normal } = target;
  if (piece.components && !gripEnabled) {
    faceMarker.visible = false;
    return;
  }
  if (gripEnabled) {
    const grip = gripCandidateFromTarget(target);
    if (!grip) {
      faceMarker.visible = false;
      gripHand.visible = false;
      return;
    }
    const marker = grip.marker ?? buildGripPointMarkerGeometry(piece, localPoint, normal);
    setGripMarkerStyle(grip.fitValid ?? grip.valid);
    faceMarker.visible = true;
    faceMarker.position.copy(piece.mesh.position);
    faceMarker.rotation.set(0, 0, 0);
    faceMarker.scale.set(1, 1, 1);
    setFaceMarkerGeometry(marker.surface, marker.lines);
    placeGripHand(target, grip);
    return;
  }
  const hitCell = surfaceCellFromLocalPoint(piece, localPoint, normal);
  if (!hitCell || !isExposedSurfaceCell(piece, hitCell, normal)) {
    faceMarker.visible = false;
    return;
  }

  const marker = selectedTool === "saw"
    ? buildSawMarkerGeometry(piece, hitCell, normal)
    : selectedTool === "handDrill"
      ? buildDrillMarkerGeometry(piece, hitCell, normal)
      : buildFaceCellMarkerGeometry(piece, hitCell, normal);

  if (!marker) {
    faceMarker.visible = false;
    return;
  }

  faceMarker.visible = true;
  faceMarker.position.copy(piece.mesh.position);
  faceMarker.rotation.set(0, 0, 0);
  faceMarker.scale.set(1, 1, 1);
  setDefaultFaceMarkerStyle();
  setFaceMarkerGeometry(marker.surface, marker.lines);
}

function setDefaultFaceMarkerStyle() {
  faceMarkerSurface.material.color.set(0xffc76a);
  faceMarkerSurface.material.opacity = 0.24;
  faceMarkerLines.material.color.set(0xfff1a8);
}

function setGripMarkerStyle(valid) {
  faceMarkerSurface.material.color.set(valid ? 0x45ff8a : 0xff5d4c);
  faceMarkerSurface.material.opacity = valid ? 0.34 : 0.28;
  faceMarkerLines.material.color.set(valid ? 0xc5ffd8 : 0xffb4a8);
}

function gripCandidateFromTarget(target, options = {}) {
  if (!target?.piece) return null;
  const { piece, localPoint, normal } = target;
  const normalAxis = dominantAxis(normal);
  const compoundGrip = piece.components ? compoundGripSurfaceForLocalPoint(piece, localPoint, normal) : null;
  const surface = piece.components ? compoundGrip?.surface : gripSurfaceCellForLocalPoint(piece, localPoint, normal);
  if (!piece.components && !surface) return null;
  if (piece.components && !compoundGrip) return null;
  const surfaceLocalPoint = compoundGrip?.localPoint ?? surface?.localPoint ?? localPoint;
  const footprintA = avatarHandGripFootprint.x;
  const footprintB = avatarHandGripFootprint.y;
  const region = compoundGrip?.region ?? gripSurfaceRegionForCell(piece, surface.cell, normal);
  if (!region) return null;
  const angle = currentGripGestureAngle();
  const gripLocalPoint = gripLocalPointForRegion(surfaceLocalPoint, normal, region, footprintA, footprintB);
  const marker = compoundGrip
    ? buildCompoundGripPlacementMarkerGeometry(compoundGrip, gripLocalPoint, normal, footprintA, footprintB, angle)
    : buildGripPlacementMarkerGeometry(piece, gripLocalPoint, normal, footprintA, footprintB, angle);
  const fit = evaluateGripFit(footprintA, footprintB, region.sizeA, region.sizeB, {
    normalAxis,
    contactArea: marker.contactArea,
    foldedArea: marker.foldedArea,
    patchCount: marker.patchCount,
  });
  const sourcePieces = compoundGrip?.sourcePieces ?? gripCollisionSourcePieces(piece);
  const collision = fit.valid
    ? gripCandidateAvatarCollisionReport(piece, gripLocalPoint, normal, angle, { sourcePieces })
    : null;
  if (collision) collision.angle = angle;
  const collidesWithAvatar = Boolean(collision?.collides);
  const blockedByAvatarCollision = fit.valid && collidesWithAvatar;
  if (options.log) logGripFitMetrics({
    context: options.context ?? "grip",
    piece,
    normal,
    normalAxis,
    region,
    fit,
    collision,
  });
  return {
    valid: fit.valid && !blockedByAvatarCollision,
    reason: blockedByAvatarCollision ? "avatar-collision" : fit.reason,
    collidesWithAvatar,
    blockedByAvatarCollision,
    collision: collision ?? emptyGripCollisionReport(),
    fitValid: fit.valid,
    fitReason: fit.reason,
    localPoint: gripLocalPoint,
    normal: normal.clone(),
    angle,
    marker,
    sourcePieces,
  };
}

function gripCandidateCollidesWithAvatar(piece, gripLocalPoint, normal, angle = 0, options = {}) {
  return gripCandidateAvatarCollisionReport(piece, gripLocalPoint, normal, angle, options).collides;
}

function emptyGripCollisionReport() {
  return {
    collides: false,
    collisionCount: 0,
    ignoredHandCollisionCount: 0,
    collisionParts: [],
    ignoredCollisionParts: [],
    collisions: [],
  };
}

function gripCandidateAvatarCollisionReport(piece, gripLocalPoint, normal, angle = 0, options = {}) {
  const { rightArm } = forgeAvatar?.userData?.limbs ?? {};
  if (!piece || !gripLocalPoint || !normal || !rightArm) return emptyGripCollisionReport();

  forgeAvatar.updateMatrixWorld(true);
  rightArm.updateMatrixWorld(true);

  const sourcePieces = options.sourcePieces?.length ? options.sourcePieces : gripCollisionSourcePieces(piece);
  const bounds = localBoundsForPieces(sourcePieces);
  const origin = bounds.getCenter(new THREE.Vector3());
  const itemProfile = gripCollisionItemProfile(sourcePieces, bounds);
  const gripOffset = gripLocalPoint.clone().add(piece.offset).sub(origin);
  const itemMatrixWorld = equippedItemMatrixWorldForGrip(rightArm, gripOffset, normal, angle);
  const handContactBoxes = gripHandContactBoxes(rightArm);
  const avatarBoxes = avatarBodyCollisionBoxes();
  if (!avatarBoxes.length) return emptyGripCollisionReport();
  const avatarCollisionParts = [...new Set(avatarBoxes.map((box) => box.name))];

  const collisions = [];
  const collisionPartSet = new Set();
  const ignoredCollisionPartSet = new Set();
  let collisionCount = 0;
  let ignoredHandCollisionCount = 0;
  const maxLoggedPairs = 12;
  for (const itemBox of equippedItemCollisionBoxes(sourcePieces, origin, itemMatrixWorld)) {
    for (const avatarBox of avatarBoxes) {
      if (!orientedBoxIntersectsOrientedBox(itemBox, avatarBox.box)) continue;
      const collisionPatch = collisionPatchOnItem(itemBox, avatarBox.box);
      const penetrationDepth = orientedBoxPenetrationDepth(itemBox, avatarBox.box);
      if (collisionPatch && canIgnoreGripCollisionPatch(collisionPatch, avatarBox.name, handContactBoxes, penetrationDepth, itemProfile)) {
        ignoredHandCollisionCount += 1;
        ignoredCollisionPartSet.add(avatarBox.name);
        continue;
      }
      collisionCount += 1;
      collisionPartSet.add(avatarBox.name);
      if (collisions.length < maxLoggedPairs) {
        collisions.push({
          avatarPart: avatarBox.name,
          itemBox: summarizeBox3(itemBox),
          avatarBox: summarizeBox3(avatarBox.box),
          intersectionBox: summarizeBox3(intersectionBox3(itemBox.aabb, avatarBox.box.aabb)),
          collisionPatch: summarizeCollisionPatch(collisionPatch),
          penetrationDepth: Number((penetrationDepth ?? 0).toFixed(4)),
        });
      }
    }
  }
  return {
    collides: collisionCount > 0,
    collisionCount,
    ignoredHandCollisionCount,
    collisionParts: [...collisionPartSet],
    ignoredCollisionParts: [...ignoredCollisionPartSet],
    avatarCollisionParts,
    collisions,
  };
}

function equippedItemMatrixWorldForGrip(rightArm, gripOffset, gripNormal, gripAngle = 0) {
  const gripBasis = gripSurfaceBasis(gripNormal, gripAngle);
  const { handSide, handFront, handApproach } = avatarPalmDownGripBasis();
  const sourceMatrix = new THREE.Matrix4().makeBasis(gripBasis.side, gripBasis.front, gripBasis.approach);
  const targetMatrix = new THREE.Matrix4().makeBasis(handSide, handFront, handApproach);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(targetMatrix.multiply(sourceMatrix.invert()));
  const gripOffsetInArm = gripOffset.clone().applyQuaternion(quaternion);
  const embeddedAnchor = avatarGripHandAnchor.clone().add(handApproach.clone().multiplyScalar(gripHandEmbedDepth));
  const position = embeddedAnchor.sub(gripOffsetInArm);
  const localMatrix = new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(1, 1, 1));
  return rightArm.matrixWorld.clone().multiply(localMatrix);
}

function gripCollisionItemProfile(sourcePieces, bounds = null) {
  const itemBounds = bounds ?? localBoundsForPieces(sourcePieces);
  const size = itemBounds.getSize(new THREE.Vector3());
  const spans = [size.x, size.y, size.z].filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  const narrowSpan = spans[0] ?? 0;
  const middleSpan = spans[1] ?? 0;
  const longSpan = spans[2] ?? 0;
  return {
    narrowSpan,
    middleSpan,
    longSpan,
    slender: narrowSpan > 0 && narrowSpan <= 0.18 && longSpan >= narrowSpan * 5,
  };
}

function equippedItemCollisionBoxes(sourcePieces, origin, itemMatrixWorld) {
  const boxes = [];
  for (const piece of sourcePieces) {
    for (const component of componentsFromPiece(piece)) {
      const componentCenter = piece.offset.clone().add(component.offset ?? new THREE.Vector3()).sub(origin);
      if (componentIsFullySolid(component)) {
        boxes.push(transformedLocalBox(componentCenter, component.dims, itemMatrixWorld));
        continue;
      }
      const cells = component.solidCells ?? solidCellsFor(component);
      for (const cell of cells) {
        boxes.push(transformedLocalVoxelCellBox(component, componentCenter, cell, itemMatrixWorld));
      }
    }
  }
  return boxes;
}

function transformedLocalBox(center, dims, matrixWorld) {
  return orientedBoxFromLocalBox(center, dims, matrixWorld);
}

function orientedBoxFromLocalBox(center, dims, matrixWorld) {
  const matrixScale = new THREE.Vector3();
  matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), matrixScale);
  const halfSize = new THREE.Vector3(
    Math.abs(dims.x * matrixScale.x) * 0.5,
    Math.abs(dims.y * matrixScale.y) * 0.5,
    Math.abs(dims.z * matrixScale.z) * 0.5,
  );
  const worldCenter = center.clone().applyMatrix4(matrixWorld);
  const rotation = new THREE.Matrix4().extractRotation(matrixWorld);
  const axes = [
    new THREE.Vector3(1, 0, 0).applyMatrix4(rotation).normalize(),
    new THREE.Vector3(0, 1, 0).applyMatrix4(rotation).normalize(),
    new THREE.Vector3(0, 0, 1).applyMatrix4(rotation).normalize(),
  ];
  const corners = orientedBoxCorners(worldCenter, halfSize, axes);
  return {
    center: worldCenter,
    halfSize,
    axes,
    corners,
    aabb: new THREE.Box3().setFromPoints(corners),
  };
}

function orientedBoxFromCenterSizeAxes(center, size, axes) {
  const halfSize = size.clone().multiplyScalar(0.5);
  const normalizedAxes = axes.map((axis) => axis.clone().normalize());
  const corners = orientedBoxCorners(center, halfSize, normalizedAxes);
  return {
    center: center.clone(),
    halfSize,
    axes: normalizedAxes,
    corners,
    aabb: new THREE.Box3().setFromPoints(corners),
  };
}

function orientedBoxCorners(center, halfSize, axes) {
  const corners = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        corners.push(center.clone()
          .addScaledVector(axes[0], sx * halfSize.x)
          .addScaledVector(axes[1], sy * halfSize.y)
          .addScaledVector(axes[2], sz * halfSize.z));
      }
    }
  }
  return corners;
}

function orientedBoxIntersectsBox3(obb, box) {
  if (!obb?.corners?.length || !box) return false;
  if (!boxesOverlap(obb.aabb, box)) return false;
  const boxCorners = box3Corners(box);
  const axes = [
    ...obb.axes,
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ];
  const worldAxes = axes.slice(3);
  for (const axisA of obb.axes) {
    for (const axisB of worldAxes) {
      const cross = new THREE.Vector3().crossVectors(axisA, axisB);
      if (cross.lengthSq() > 1e-8) axes.push(cross.normalize());
    }
  }
  return axes.every((axis) => projectedIntervalsOverlap(projectPoints(obb.corners, axis), projectPoints(boxCorners, axis)));
}

function orientedBoxIntersectsOrientedBox(a, b) {
  if (!a?.corners?.length || !b?.corners?.length) return false;
  if (!boxesOverlap(a.aabb, b.aabb)) return false;
  const axes = [...a.axes, ...b.axes];
  for (const axisA of a.axes) {
    for (const axisB of b.axes) {
      const cross = new THREE.Vector3().crossVectors(axisA, axisB);
      if (cross.lengthSq() > 1e-8) axes.push(cross.normalize());
    }
  }
  return axes.every((axis) => projectedIntervalsOverlap(projectPoints(a.corners, axis), projectPoints(b.corners, axis)));
}

function orientedBoxPenetrationDepth(a, b) {
  if (!a?.corners?.length || !b?.corners?.length) return 0;
  if (!boxesOverlap(a.aabb, b.aabb)) return 0;
  const axes = [...a.axes, ...b.axes];
  for (const axisA of a.axes) {
    for (const axisB of b.axes) {
      const cross = new THREE.Vector3().crossVectors(axisA, axisB);
      if (cross.lengthSq() > 1e-8) axes.push(cross.normalize());
    }
  }
  let minDepth = Infinity;
  for (const axis of axes) {
    const projectionA = projectPoints(a.corners, axis);
    const projectionB = projectPoints(b.corners, axis);
    const overlap = Math.min(projectionA.max, projectionB.max) - Math.max(projectionA.min, projectionB.min);
    if (overlap <= 0) return 0;
    minDepth = Math.min(minDepth, overlap);
  }
  return Number.isFinite(minDepth) ? minDepth : 0;
}

function gripHandContactBoxes(rightArm) {
  const { leftArm } = forgeAvatar?.userData?.limbs ?? {};
  return preciseLimbContactBoxes([leftArm, rightArm]);
}

function preciseLimbContactBoxes(limbs) {
  const boxes = [];
  for (const limb of limbs) {
    if (!limb) continue;
    limb.updateMatrixWorld(true);
    limb.traverse((object) => {
      if (!object.isMesh || shouldIgnoreLimbContactMesh(object)) return;
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      const box = object.geometry.boundingBox?.clone?.();
      if (!box) return;
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3()).addScalar(0.018);
      boxes.push(orientedBoxFromLocalBox(center, size, object.matrixWorld));
    });
  }
  return boxes;
}

function shouldIgnoreLimbContactMesh(object) {
  const ignoredNames = new Set([
    "equippedTool",
    "heldBlock",
    "equippedForgedItem",
    "gripHand",
    "gripFailurePreview",
    "gripCollisionGhost",
    "gripCollisionPosePreview",
    "gripCollisionFlash",
    "faceMarker",
    "gripBindingMarker",
  ]);
  for (let current = object; current; current = current.parent) {
    if (ignoredNames.has(current.name)) return true;
  }
  return false;
}

function collisionPatchTouchesHandContact(patch, handContactBoxes) {
  if (!patch || !handContactBoxes) return false;
  const patchBox = orientedBoxFromCenterSizeAxes(patch.center, patch.size, patch.axes);
  return handContactBoxes.some((box) => orientedBoxIntersectsOrientedBox(patchBox, box));
}

function canIgnoreGripCollisionPatch(patch, avatarPartName, handContactBoxes, penetrationDepth = 0, itemProfile = null) {
  if (!collisionPatchTouchesHandContact(patch, handContactBoxes)) return false;
  if (isHardProtectedAvatarCollisionPart(avatarPartName)) return false;
  return canIgnoreCarrySideGrazingCollision(patch, avatarPartName, penetrationDepth, itemProfile);
}

function canIgnoreCarrySideGrazingCollision(patch, avatarPartName, penetrationDepth = 0, itemProfile = null) {
  if (!itemProfile?.slender || !isCarrySideAvatarCollisionPart(avatarPartName)) return false;
  const rawSize = patch.rawSize ?? patch.size;
  const rawVolume = rawSize.x * rawSize.y * rawSize.z;
  const maxDepth = Math.max(rawSize.x, rawSize.y, rawSize.z);
  const narrowLimit = Math.max(0.035, itemProfile.narrowSpan * 0.58);
  const volumeLimit = Math.max(0.0015, itemProfile.narrowSpan * itemProfile.narrowSpan * 0.42);
  return (
    penetrationDepth <= narrowLimit ||
    (rawVolume <= volumeLimit && maxDepth <= Math.max(0.16, itemProfile.middleSpan * 1.35))
  );
}

function isCarrySideAvatarCollisionPart(name) {
  if (!name) return false;
  return /rightBackpackSidePocket|rightBackpackStrap|rightBackpackShoulder|rightLeg|rightLegPant|rightLegBootLip|rightLegBoot|belt|buckle/i.test(name);
}

function isHardProtectedAvatarCollisionPart(name) {
  if (!name) return true;
  if (isCarrySideAvatarCollisionPart(name)) return false;
  return /body|shirt|collar|backpack|head|eye|nose|mouth|hair/i.test(name);
}

function isSoftProtectedAvatarCollisionPart(name) {
  if (!name) return false;
  return /belt|buckle|leg|pants|boot/i.test(name);
}

function collisionPatchOnItem(itemBox, avatarBox) {
  if (!itemBox?.corners?.length || !avatarBox?.corners?.length) return null;
  const localCenter = new THREE.Vector3();
  const size = new THREE.Vector3();
  const rawSize = new THREE.Vector3();
  for (let index = 0; index < 3; index++) {
    const axis = itemBox.axes[index];
    const itemCenterProjection = itemBox.center.dot(axis);
    const itemHalf = itemBox.halfSize.getComponent(index);
    const itemMin = itemCenterProjection - itemHalf;
    const itemMax = itemCenterProjection + itemHalf;
    const avatarProjection = projectPoints(avatarBox.corners, axis);
    const min = Math.max(itemMin, avatarProjection.min);
    const max = Math.min(itemMax, avatarProjection.max);
    if (max <= min) return null;
    const fullSize = itemHalf * 2;
    const overlapSize = max - min;
    const minVisibleSize = Math.min(0.035, fullSize);
    rawSize.setComponent(index, overlapSize);
    size.setComponent(index, Math.min(fullSize, Math.max(overlapSize, minVisibleSize)));
    localCenter.setComponent(index, (min + max) * 0.5 - itemCenterProjection);
  }
  const center = itemBox.center.clone()
    .addScaledVector(itemBox.axes[0], localCenter.x)
    .addScaledVector(itemBox.axes[1], localCenter.y)
    .addScaledVector(itemBox.axes[2], localCenter.z);
  return {
    center,
    size,
    rawSize,
    axes: itemBox.axes.map((axis) => axis.clone()),
  };
}

function summarizeCollisionPatch(patch) {
  if (!patch) return null;
  return {
    center: summarizeVector3(patch.center),
    size: summarizeVector3(patch.size),
    rawSize: patch.rawSize ? summarizeVector3(patch.rawSize) : null,
    axes: patch.axes.map(summarizeVector3),
  };
}

function collisionPatchFromSummary(summary) {
  if (!summary?.center || !summary?.size || !Array.isArray(summary.axes) || summary.axes.length !== 3) return null;
  const center = vector3FromSummary(summary.center);
  const size = vector3FromSummary(summary.size);
  const axes = summary.axes.map(vector3FromSummary);
  if (!center || !size || axes.some((axis) => !axis)) return null;
  if (size.x <= 0.001 || size.y <= 0.001 || size.z <= 0.001) return null;
  return { center, size, axes };
}

function summarizeVector3(vector) {
  return {
    x: Number(vector.x.toFixed(4)),
    y: Number(vector.y.toFixed(4)),
    z: Number(vector.z.toFixed(4)),
  };
}

function vector3FromSummary(summary) {
  if (!summary) return null;
  const vector = new THREE.Vector3(Number(summary.x), Number(summary.y), Number(summary.z));
  return Number.isFinite(vector.x + vector.y + vector.z) ? vector : null;
}

function box3Corners(box) {
  return [
    new THREE.Vector3(box.min.x, box.min.y, box.min.z),
    new THREE.Vector3(box.min.x, box.min.y, box.max.z),
    new THREE.Vector3(box.min.x, box.max.y, box.min.z),
    new THREE.Vector3(box.min.x, box.max.y, box.max.z),
    new THREE.Vector3(box.max.x, box.min.y, box.min.z),
    new THREE.Vector3(box.max.x, box.min.y, box.max.z),
    new THREE.Vector3(box.max.x, box.max.y, box.min.z),
    new THREE.Vector3(box.max.x, box.max.y, box.max.z),
  ];
}

function projectPoints(points, axis) {
  let min = Infinity;
  let max = -Infinity;
  for (const point of points) {
    const value = point.dot(axis);
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max };
}

function projectedIntervalsOverlap(a, b) {
  const epsilon = 0.0005;
  return a.min <= b.max - epsilon && a.max >= b.min + epsilon;
}

function intersectionBox3(a, b) {
  return new THREE.Box3(
    new THREE.Vector3(
      Math.max(a.min.x, b.min.x),
      Math.max(a.min.y, b.min.y),
      Math.max(a.min.z, b.min.z),
    ),
    new THREE.Vector3(
      Math.min(a.max.x, b.max.x),
      Math.min(a.max.y, b.max.y),
      Math.min(a.max.z, b.max.z),
    ),
  );
}

function transformedLocalVoxelCellBox(component, componentCenter, cell, matrixWorld) {
  const [x, y, z] = cell;
  const { dims, grid } = component;
  const cellSize = new THREE.Vector3(dims.x / grid.x, dims.y / grid.y, dims.z / grid.z);
  const center = new THREE.Vector3(
    componentCenter.x - dims.x * 0.5 + x * cellSize.x,
    componentCenter.y - dims.y * 0.5 + y * cellSize.y,
    componentCenter.z - dims.z * 0.5 + z * cellSize.z,
  ).add(cellSize.clone().multiplyScalar(0.5));
  return orientedBoxFromLocalBox(center, cellSize, matrixWorld);
}

function avatarBodyCollisionBoxes() {
  const boxes = [];
  forgeAvatar.updateMatrixWorld(true);
  forgeAvatar.traverse((object) => {
    if (!object.isMesh || !object.visible || shouldIgnoreAvatarCollisionMesh(object)) return;
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    const box = object.geometry.boundingBox?.clone?.();
    if (!box) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    boxes.push({
      name: avatarCollisionMeshName(object),
      box: orientedBoxFromLocalBox(center, size, object.matrixWorld),
    });
  });
  return boxes;
}

function avatarCollisionMeshName(object) {
  for (let current = object; current; current = current.parent) {
    if (current.name) return current.name;
  }
  return "avatarPart";
}

function shouldIgnoreAvatarCollisionMesh(object) {
  const ignoredNames = new Set([
    "leftArm",
    "rightArm",
    "equippedTool",
    "heldBlock",
    "equippedForgedItem",
    "gripHand",
    "gripFailurePreview",
    "gripCollisionGhost",
    "gripCollisionPosePreview",
    "gripCollisionFlash",
    "faceMarker",
    "gripBindingMarker",
  ]);
  for (let current = object; current; current = current.parent) {
    if (current.userData?.ignoreAvatarCollision) return true;
    if (ignoredNames.has(current.name)) return true;
  }
  return false;
}

function gripFootprintCoversRegion(footprintA, footprintB, regionA, regionB, options = {}) {
  return evaluateGripFit(footprintA, footprintB, regionA, regionB, options).valid;
}

function evaluateGripFit(footprintA, footprintB, regionA, regionB, options = {}) {
  const epsilon = 0.0005;
  const footprintArea = footprintA * footprintB;
  const regionArea = regionA * regionB;
  const palmSpan = Math.max(footprintA, footprintB);
  const itemNarrowSpan = Math.min(regionA, regionB);
  const areaFits = regionArea <= footprintArea + epsilon;
  const narrowSpanAllowed = true;
  const narrowSpanFits = narrowSpanAllowed && itemNarrowSpan <= palmSpan + epsilon;
  const topOrBottomFace = options.normalAxis === 1;
  const contactArea = Math.max(0, Number(options.contactArea) || 0);
  const foldedArea = Math.max(0, Number(options.foldedArea) || 0);
  const patchCount = Math.max(0, Number(options.patchCount) || 0);
  const hasContactArea = Number.isFinite(Number(options.contactArea)) && patchCount > 0;
  const contactCoverage = footprintArea > 0 ? THREE.MathUtils.clamp(contactArea / footprintArea, 0, 1) : 0;
  const contactValid = !hasContactArea || contactCoverage >= minimumGripContactCoverage;
  const shapeValid = areaFits || narrowSpanFits;
  const shapeReason = areaFits ? "area-fits" : narrowSpanFits ? (topOrBottomFace ? "top-face-edge-fits" : "narrow-span-fits") : "area-and-span-too-large";
  return {
    valid: shapeValid && contactValid,
    reason: !shapeValid ? shapeReason : contactValid ? shapeReason : "contact-area-too-small",
    palmWidth: footprintA,
    palmHeight: footprintB,
    palmArea: footprintArea,
    palmSpan,
    narrowSpanAllowed,
    topOrBottomFace,
    itemWidth: regionA,
    itemHeight: regionB,
    itemArea: regionArea,
    itemNarrowSpan,
    gripContactArea: contactArea,
    gripContactCoverage: contactCoverage,
    minGripContactCoverage: minimumGripContactCoverage,
    gripContactConformDepth,
    foldedGripArea: foldedArea,
    gripPatchCount: patchCount,
    epsilon,
  };
}

function logGripFitMetrics({ context, piece, normal, normalAxis, region, fit, collision = null }) {
  const collisionParts = collision?.collisionParts ?? [];
  const collidesWithAvatar = Boolean(collision?.collides);
  const blockedByAvatarCollision = fit.valid && collidesWithAvatar;
  const metrics = {
    context,
    valid: fit.valid && !blockedByAvatarCollision,
    reason: blockedByAvatarCollision ? "avatar-collision" : fit.reason,
    fitValid: fit.valid,
    fitReason: fit.reason,
    collidesWithAvatar,
    blockedByAvatarCollision,
    collisionEvaluated: Boolean(collision),
    gripAngle: Number((collision?.angle ?? 0).toFixed(4)),
    gripAngleDegrees: Math.round(THREE.MathUtils.radToDeg(collision?.angle ?? 0)),
    collisionCount: collision?.collisionCount ?? 0,
    ignoredHandCollisionCount: collision?.ignoredHandCollisionCount ?? 0,
    collisionParts,
    ignoredCollisionParts: collision?.ignoredCollisionParts ?? [],
    avatarCollisionParts: collision?.avatarCollisionParts ?? [],
    firstCollisionPart: collisionParts[0] ?? null,
    collisionPairs: collision?.collisions ?? [],
    palmArea: Number(fit.palmArea.toFixed(6)),
    itemArea: Number(fit.itemArea.toFixed(6)),
    palmWidth: Number(fit.palmWidth.toFixed(4)),
    palmHeight: Number(fit.palmHeight.toFixed(4)),
    itemWidth: Number(fit.itemWidth.toFixed(4)),
    itemHeight: Number(fit.itemHeight.toFixed(4)),
    palmSpan: Number(fit.palmSpan.toFixed(4)),
    itemNarrowSpan: Number(fit.itemNarrowSpan.toFixed(4)),
    gripContactArea: Number((fit.gripContactArea ?? 0).toFixed(6)),
    gripContactCoverage: Number((fit.gripContactCoverage ?? 0).toFixed(4)),
    minGripContactCoverage: Number((fit.minGripContactCoverage ?? 0).toFixed(4)),
    gripContactConformDepth: Number((fit.gripContactConformDepth ?? 0).toFixed(4)),
    foldedGripArea: Number((fit.foldedGripArea ?? 0).toFixed(6)),
    gripPatchCount: fit.gripPatchCount ?? 0,
    narrowSpanAllowed: fit.narrowSpanAllowed,
    topOrBottomFace: fit.topOrBottomFace,
    pieceDims: {
      x: Number(piece.dims.x.toFixed(4)),
      y: Number(piece.dims.y.toFixed(4)),
      z: Number(piece.dims.z.toFixed(4)),
    },
    normal: {
      x: Number(normal.x.toFixed(4)),
      y: Number(normal.y.toFixed(4)),
      z: Number(normal.z.toFixed(4)),
    },
    normalAxis,
    regionSource: region.source ?? "surface",
  };
  window.NicechunkForgingGripDebug = metrics;
  if (collidesWithAvatar) console.warn("[NiceChunk Forging Grip Collision Parts]", collisionParts);
}

function summarizeBox3(box) {
  const targetBox = box?.isBox3 ? box : box?.aabb;
  if (!targetBox) return null;
  return {
    min: {
      x: Number(targetBox.min.x.toFixed(4)),
      y: Number(targetBox.min.y.toFixed(4)),
      z: Number(targetBox.min.z.toFixed(4)),
    },
    max: {
      x: Number(targetBox.max.x.toFixed(4)),
      y: Number(targetBox.max.y.toFixed(4)),
      z: Number(targetBox.max.z.toFixed(4)),
    },
  };
}

function gripSurfaceRegionForCell(piece, hitCell, normal) {
  const normalAxis = dominantAxis(normal);
  const sign = Math.sign(normal.getComponent(normalAxis)) || 1;
  const axes = [0, 1, 2].filter((axis) => axis !== normalAxis);
  const wholeFace = gripWholeFaceRegionForSolidPiece(piece, normalAxis, sign, axes);
  if (wholeFace) return wholeFace;
  const layer = hitCell[normalAxis];
  const grid = [piece.grid.x, piece.grid.y, piece.grid.z];
  const dims = [piece.dims.x, piece.dims.y, piece.dims.z];
  let minA = Infinity;
  let maxA = -Infinity;
  let minB = Infinity;
  let maxB = -Infinity;
  const visited = new Set();
  const pending = [hitCell];
  const keyFor = (cell) => `${cell[0]},${cell[1]},${cell[2]}`;
  const isSameSurfaceCell = (cell) => (
    cell[normalAxis] === layer &&
    isSolid(piece, cell[0], cell[1], cell[2]) &&
    !isSolid(
      piece,
      cell[0] + (normalAxis === 0 ? sign : 0),
      cell[1] + (normalAxis === 1 ? sign : 0),
      cell[2] + (normalAxis === 2 ? sign : 0),
    )
  );
  while (pending.length) {
    const cell = pending.pop();
    const key = keyFor(cell);
    if (visited.has(key) || !isSameSurfaceCell(cell)) continue;
    visited.add(key);
    minA = Math.min(minA, cell[axes[0]]);
    maxA = Math.max(maxA, cell[axes[0]] + 1);
    minB = Math.min(minB, cell[axes[1]]);
    maxB = Math.max(maxB, cell[axes[1]] + 1);
    for (const delta of [-1, 1]) {
      const nextA = [...cell];
      nextA[axes[0]] += delta;
      if (!visited.has(keyFor(nextA))) pending.push(nextA);
      const nextB = [...cell];
      nextB[axes[1]] += delta;
      if (!visited.has(keyFor(nextB))) pending.push(nextB);
    }
  }
  if (minA === Infinity) {
    minA = hitCell[axes[0]];
    maxA = minA + 1;
    minB = hitCell[axes[1]];
    maxB = minB + 1;
  }
  const cellA = dims[axes[0]] / grid[axes[0]];
  const cellB = dims[axes[1]] / grid[axes[1]];
  return {
    source: "connected-surface",
    axes,
    minA: -dims[axes[0]] * 0.5 + minA * cellA,
    maxA: -dims[axes[0]] * 0.5 + maxA * cellA,
    minB: -dims[axes[1]] * 0.5 + minB * cellB,
    maxB: -dims[axes[1]] * 0.5 + maxB * cellB,
    sizeA: (maxA - minA) * cellA,
    sizeB: (maxB - minB) * cellB,
    plane: -dims[normalAxis] * 0.5 +
      (sign > 0 ? layer + 1 : layer) * dims[normalAxis] / grid[normalAxis],
  };
}

function gripWholeFaceRegionForSolidPiece(piece, normalAxis, sign, axes) {
  if (!piece || piece.components) return null;
  const totalCells = piece.grid.x * piece.grid.y * piece.grid.z;
  const solidCount = piece.solidCells?.length ?? solidCellsFor(piece).length;
  if (solidCount !== totalCells) return null;
  const dims = [piece.dims.x, piece.dims.y, piece.dims.z];
  return {
    source: "whole-solid-face",
    axes,
    minA: -dims[axes[0]] * 0.5,
    maxA: dims[axes[0]] * 0.5,
    minB: -dims[axes[1]] * 0.5,
    maxB: dims[axes[1]] * 0.5,
    sizeA: dims[axes[0]],
    sizeB: dims[axes[1]],
    plane: sign > 0 ? dims[normalAxis] * 0.5 : -dims[normalAxis] * 0.5,
  };
}

function compoundGripSurfaceForLocalPoint(piece, localPoint, normal) {
  if (!piece?.components?.length || !localPoint || !normal) return null;
  const normalAxis = dominantAxis(normal);
  const tangentAxes = [0, 1, 2].filter((axis) => axis !== normalAxis);
  let best = null;
  let bestScore = Infinity;
  for (const component of piece.components) {
    const proxy = componentGripProxy(component);
    const componentLocalPoint = localPoint.clone().sub(component.offset ?? new THREE.Vector3());
    if (!componentLocalPointNearGripSurface(componentLocalPoint, proxy, normal)) continue;
    const surface = gripSurfaceCellForLocalPoint(proxy, componentLocalPoint, normal);
    if (!surface) continue;
    const componentSurfacePoint = surface.localPoint ?? componentLocalPoint;
    const castSurfacePoint = componentSurfacePoint.clone().add(component.offset ?? new THREE.Vector3());
    const tangentA = castSurfacePoint.getComponent(tangentAxes[0]) - localPoint.getComponent(tangentAxes[0]);
    const tangentB = castSurfacePoint.getComponent(tangentAxes[1]) - localPoint.getComponent(tangentAxes[1]);
    const normalDistance = castSurfacePoint.getComponent(normalAxis) - localPoint.getComponent(normalAxis);
    const score = tangentA * tangentA + tangentB * tangentB + normalDistance * normalDistance * 0.25;
    if (score >= bestScore) continue;
    const componentRegion = gripSurfaceRegionForCell(proxy, surface.cell, normal);
    if (!componentRegion) continue;
    bestScore = score;
    const sourcePiece = gripCollisionSourcePieceForComponent(piece, component);
    best = {
      component,
      proxy,
      surface,
      componentLocalPoint: componentSurfacePoint,
      localPoint: castSurfacePoint,
      region: translateGripRegion(componentRegion, component.offset ?? new THREE.Vector3(), "component-surface"),
      sourcePieces: sourcePiece ? [sourcePiece] : [piece],
    };
  }
  return best;
}

function componentLocalPointNearGripSurface(localPoint, component, normal) {
  const normalAxis = dominantAxis(normal);
  const dims = [component.dims.x, component.dims.y, component.dims.z];
  const grid = [component.grid.x, component.grid.y, component.grid.z];
  for (let axis = 0; axis < 3; axis++) {
    const cellSize = dims[axis] / grid[axis];
    const tolerance = axis === normalAxis
      ? Math.max(cellSize * 2.4, avatarHandGripSize.z * 0.6)
      : Math.max(cellSize * 1.2, 0.025);
    const value = localPoint.getComponent(axis);
    if (value < -dims[axis] * 0.5 - tolerance || value > dims[axis] * 0.5 + tolerance) return false;
  }
  return true;
}

function componentGripProxy(component) {
  return {
    dims: component.dims,
    grid: component.grid,
    solid: component.solid,
    solidCells: component.solidCells ?? solidCellsFor(component),
    fullSolid: component.fullSolid,
  };
}

function translateGripRegion(region, offset, source = region.source) {
  const normalAxis = [0, 1, 2].find((axis) => !region.axes.includes(axis));
  return {
    ...region,
    source,
    minA: region.minA + offset.getComponent(region.axes[0]),
    maxA: region.maxA + offset.getComponent(region.axes[0]),
    minB: region.minB + offset.getComponent(region.axes[1]),
    maxB: region.maxB + offset.getComponent(region.axes[1]),
    plane: normalAxis === undefined ? region.plane : region.plane + offset.getComponent(normalAxis),
  };
}

function buildCompoundGripPlacementMarkerGeometry(componentGrip, gripLocalPoint, normal, footprintA, footprintB, angle) {
  const componentOffset = componentGrip.component.offset ?? new THREE.Vector3();
  const marker = buildGripPlacementMarkerGeometry(
    componentGrip.proxy,
    gripLocalPoint.clone().sub(componentOffset),
    normal,
    footprintA,
    footprintB,
    angle,
  );
  return offsetGripMarkerGeometry(marker, componentOffset);
}

function offsetGripMarkerGeometry(marker, offset) {
  return {
    ...marker,
    surface: offsetPositionArray(marker.surface, offset),
    lines: offsetPositionArray(marker.lines, offset),
  };
}

function offsetPositionArray(positions, offset) {
  const shifted = [...positions];
  for (let index = 0; index < shifted.length; index += 3) {
    shifted[index] += offset.x;
    shifted[index + 1] += offset.y;
    shifted[index + 2] += offset.z;
  }
  return shifted;
}

function gripBoundingFaceRegion(piece, localPoint, normalAxis) {
  if (!piece.mesh.geometry.boundingBox) piece.mesh.geometry.computeBoundingBox();
  const box = piece.mesh.geometry.boundingBox;
  if (!box) return null;
  const axes = [0, 1, 2].filter((axis) => axis !== normalAxis);
  const minA = box.min.getComponent(axes[0]);
  const maxA = box.max.getComponent(axes[0]);
  const minB = box.min.getComponent(axes[1]);
  const maxB = box.max.getComponent(axes[1]);
  return {
    source: "bounding-face",
    axes,
    minA,
    maxA,
    minB,
    maxB,
    sizeA: maxA - minA,
    sizeB: maxB - minB,
    plane: localPoint.getComponent(normalAxis),
  };
}

function gripLocalPointForRegion(localPoint, normal, region, footprintA, footprintB) {
  const normalAxis = dominantAxis(normal);
  const coordinate = [localPoint.x, localPoint.y, localPoint.z];
  coordinate[normalAxis] = region.plane;
  return new THREE.Vector3(coordinate[0], coordinate[1], coordinate[2]);
}

function buildGripPlacementMarkerGeometry(piece, localPoint, normal, footprintA = avatarHandGripFootprint.x, footprintB = avatarHandGripFootprint.y, angle = 0) {
  const contact = buildFoldedGripContactPatches(piece, localPoint, normal, footprintA, footprintB, angle);
  const voxelContact = voxelGripContactAreaForPatches(piece, contact.patches);
  if (voxelContact) {
    contact.primaryArea = voxelContact.primaryArea;
    contact.foldedArea = voxelContact.foldedArea;
    contact.contactArea = voxelContact.contactArea;
  }
  const surface = [];
  const lines = [];
  for (const patch of contact.patches) {
    const corners = patch.corners.map((corner) => corner.toArray());
    pushFace(surface, [], corners, [patch.normal.x, patch.normal.y, patch.normal.z]);
    pushLineLoop(lines, corners);
  }
  return {
    surface,
    lines,
    contactArea: contact.contactArea,
    primaryArea: contact.primaryArea,
    foldedArea: contact.foldedArea,
    patchCount: contact.patches.length,
  };
}

function buildFoldedGripContactPatches(piece, localPoint, normal, footprintA, footprintB, angle = 0) {
  const basis = gripSurfaceBasis(normal, angle);
  const box = gripContactBounds(piece);
  if (!box) return flatGripContactFallback(localPoint, normal, footprintA, footprintB, basis);

  const center = localPoint.clone();
  const normalProjection = center.dot(basis.approach);
  const sideRange = gripAxisRangeForBox(box, basis.side, center);
  const frontRange = gripAxisRangeForBox(box, basis.front, center);
  const depthRange = gripAxisRangeForBox(box, basis.approach, center);
  const halfA = footprintA * 0.5;
  const halfB = footprintB * 0.5;
  const requestedU = { min: -halfA, max: halfA };
  const requestedV = { min: -halfB, max: halfB };
  const primaryU = intersectRanges(requestedU, sideRange);
  const primaryV = intersectRanges(requestedV, frontRange);
  const maxFoldDepth = Math.max(0, normalProjection - depthRange.min);
  const visualOffset = gripContactVisualOffset;
  const patches = [];
  let primaryArea = 0;
  let foldedArea = 0;

  const addPatch = (corners, patchNormal, area, folded = false) => {
    if (area <= 0.000001) return;
    patches.push({
      corners: corners.map((corner) => corner.clone().add(patchNormal.clone().multiplyScalar(visualOffset))),
      normal: patchNormal.clone().normalize(),
      area,
      folded,
    });
    if (folded) foldedArea += area;
    else primaryArea += area;
  };

  if (primaryU && primaryV) {
    const corners = gripPatchCornersOnPlane(center, basis.side, basis.front, primaryU.min, primaryU.max, primaryV.min, primaryV.max);
    addPatch(corners, basis.approach, rangeSize(primaryU) * rangeSize(primaryV), false);
  }

  if (primaryV && maxFoldDepth > 0) {
    const lowerOverflow = Math.max(0, (primaryU?.min ?? sideRange.min) - requestedU.min);
    const upperOverflow = Math.max(0, requestedU.max - (primaryU?.max ?? sideRange.max));
    if (lowerOverflow > 0) {
      const depth = Math.min(lowerOverflow, maxFoldDepth);
      const edge = primaryU?.min ?? sideRange.min;
      const corners = gripFoldPatchCorners(center, basis, "side", edge, -1, primaryV.min, primaryV.max, depth);
      addPatch(corners, basis.side.clone().multiplyScalar(-1), depth * rangeSize(primaryV), true);
    }
    if (upperOverflow > 0) {
      const depth = Math.min(upperOverflow, maxFoldDepth);
      const edge = primaryU?.max ?? sideRange.max;
      const corners = gripFoldPatchCorners(center, basis, "side", edge, 1, primaryV.min, primaryV.max, depth);
      addPatch(corners, basis.side, depth * rangeSize(primaryV), true);
    }
  }

  if (primaryU && maxFoldDepth > 0) {
    const lowerOverflow = Math.max(0, (primaryV?.min ?? frontRange.min) - requestedV.min);
    const upperOverflow = Math.max(0, requestedV.max - (primaryV?.max ?? frontRange.max));
    if (lowerOverflow > 0) {
      const depth = Math.min(lowerOverflow, maxFoldDepth);
      const edge = primaryV?.min ?? frontRange.min;
      const corners = gripFoldPatchCorners(center, basis, "front", edge, -1, primaryU.min, primaryU.max, depth);
      addPatch(corners, basis.front.clone().multiplyScalar(-1), depth * rangeSize(primaryU), true);
    }
    if (upperOverflow > 0) {
      const depth = Math.min(upperOverflow, maxFoldDepth);
      const edge = primaryV?.max ?? frontRange.max;
      const corners = gripFoldPatchCorners(center, basis, "front", edge, 1, primaryU.min, primaryU.max, depth);
      addPatch(corners, basis.front, depth * rangeSize(primaryU), true);
    }
  }

  if (!patches.length) return flatGripContactFallback(localPoint, normal, footprintA, footprintB, basis);
  return {
    patches,
    primaryArea,
    foldedArea,
    contactArea: primaryArea + foldedArea,
  };
}

function flatGripContactFallback(localPoint, normal, footprintA, footprintB, basis) {
  const halfA = footprintA * 0.5;
  const halfB = footprintB * 0.5;
  const corners = gripPatchCornersOnPlane(localPoint, basis.side, basis.front, -halfA, halfA, -halfB, halfB)
    .map((corner) => corner.add(basis.approach.clone().multiplyScalar(gripContactVisualOffset)));
  const area = footprintA * footprintB;
  return {
    patches: [{ corners, normal: normal.clone().normalize(), area, folded: false }],
    primaryArea: area,
    foldedArea: 0,
    contactArea: area,
  };
}

function gripContactBounds(piece) {
  if (!piece) return null;
  if (piece.mesh?.geometry) {
    if (!piece.mesh.geometry.boundingBox) piece.mesh.geometry.computeBoundingBox();
    if (piece.mesh.geometry.boundingBox) return piece.mesh.geometry.boundingBox;
  }
  if (piece.dims) {
    return new THREE.Box3(
      piece.dims.clone().multiplyScalar(-0.5),
      piece.dims.clone().multiplyScalar(0.5),
    );
  }
  return null;
}

function gripAxisRangeForBox(box, axis, center) {
  const projection = projectPoints(box3Corners(box), axis);
  const centerProjection = center.dot(axis);
  return {
    min: projection.min - centerProjection,
    max: projection.max - centerProjection,
  };
}

function intersectRanges(a, b) {
  const min = Math.max(a.min, b.min);
  const max = Math.min(a.max, b.max);
  return max > min ? { min, max } : null;
}

function rangeSize(range) {
  return Math.max(0, range.max - range.min);
}

function gripPatchCornersOnPlane(center, side, front, uMin, uMax, vMin, vMax) {
  return [
    [uMin, vMin],
    [uMax, vMin],
    [uMax, vMax],
    [uMin, vMax],
  ].map(([u, v]) => center.clone()
    .add(side.clone().multiplyScalar(u))
    .add(front.clone().multiplyScalar(v)));
}

function gripFoldPatchCorners(center, basis, foldAxis, edge, direction, tangentMin, tangentMax, depth) {
  const tangent = foldAxis === "side" ? basis.front : basis.side;
  const edgeAxis = foldAxis === "side" ? basis.side : basis.front;
  const edgePoint = center.clone().add(edgeAxis.clone().multiplyScalar(edge));
  return [
    [0, tangentMin],
    [0, tangentMax],
    [depth, tangentMax],
    [depth, tangentMin],
  ].map(([foldDepth, tangentOffset]) => edgePoint.clone()
    .add(tangent.clone().multiplyScalar(tangentOffset))
    .add(basis.approach.clone().multiplyScalar(-foldDepth)));
}

function buildGripPointMarkerGeometry(piece, localPoint, normal) {
  const size = Math.max(0.08, Math.min(piece.dims?.x ?? 0.24, piece.dims?.y ?? 0.24, piece.dims?.z ?? 0.24) * 0.22);
  const normalAxis = dominantAxis(normal);
  const axes = [0, 1, 2].filter((axis) => axis !== normalAxis);
  const center = [localPoint.x, localPoint.y, localPoint.z];
  center[normalAxis] += (Math.sign(normal.getComponent(normalAxis)) || 1) * 0.012;
  const corners = [
    [-size, -size],
    [size, -size],
    [size, size],
    [-size, size],
  ].map(([a, b]) => {
    const coordinate = [...center];
    coordinate[axes[0]] += a;
    coordinate[axes[1]] += b;
    return coordinate;
  });
  const surface = [];
  const lines = [];
  pushFace(surface, [], corners, [normal.x, normal.y, normal.z]);
  pushLineLoop(lines, corners);
  return { surface, lines };
}

function currentGripGestureAngle() {
  return normalizeGripAngle(gripGestureRotationStep * gripGestureRotationStepRadians);
}

function normalizeGripAngle(angle) {
  const value = Number(angle) || 0;
  const fullTurn = Math.PI * 2;
  return ((value % fullTurn) + fullTurn) % fullTurn;
}

function rotateGripGesture() {
  gripGestureRotationStep = (gripGestureRotationStep + 1) % 4;
  setStatus("forging.status.gripReady");
}

function gripSurfaceBasis(normal, angle = 0) {
  const approach = normal.clone().normalize();
  let front;
  if (Math.abs(approach.y) < 0.75) {
    front = new THREE.Vector3(0, 1, 0);
  } else {
    front = new THREE.Vector3(0, 0, -Math.sign(approach.y) || -1);
  }
  front.sub(approach.clone().multiplyScalar(front.dot(approach)));
  if (front.lengthSq() < 0.0001) front.set(1, 0, 0);
  front.normalize();
  if (angle) front.applyAxisAngle(approach, angle).normalize();
  const side = new THREE.Vector3().crossVectors(front, approach).normalize();
  return { side, front, approach };
}

function placeGripHand(target, grip) {
  const { piece, point, normal } = target;
  const valid = Boolean(grip?.fitValid ?? grip?.valid);
  gripHand.visible = true;
  const { side, front, approach } = gripSurfaceBasis(normal, grip?.angle ?? currentGripGestureAngle());
  const gripPoint = grip?.localPoint
    ? piece.mesh.localToWorld(grip.localPoint.clone())
    : point.clone();
  const matrix = new THREE.Matrix4().makeBasis(side, front, approach);
  gripHand.quaternion.setFromRotationMatrix(matrix);
  const previewHandDistance = Math.max(0.012, avatarHandGripSize.z * 0.5 + 0.018 - gripHandEmbedDepth);
  gripHand.position.copy(gripPoint)
    .add(approach.clone().multiplyScalar(previewHandDistance))
    .add(front.clone().multiplyScalar(0.015));
  gripHand.traverse((child) => {
    if (!child.isMesh) return;
    child.material.color.set(valid ? 0x40ff88 : 0xff5d4c);
  });
}

function setFaceMarkerGeometry(surfacePositions, linePositions) {
  faceMarkerSurface.geometry.dispose();
  faceMarkerLines.geometry.dispose();
  faceMarkerSurface.geometry = positionsGeometry(surfacePositions);
  faceMarkerLines.geometry = positionsGeometry(linePositions);
  faceMarkerSurface.visible = surfacePositions.length > 0;
  faceMarkerLines.visible = linePositions.length > 0;
}

function updateGripBindingMarker() {
  const piece = selectedPiece;
  if (!piece?.gripOffset || !piece.gripNormal) {
    gripBindingMarker.visible = false;
    return;
  }
  let marker = null;
  if (piece.components) {
    const componentGrip = compoundGripSurfaceForLocalPoint(piece, piece.gripOffset, piece.gripNormal);
    if (!componentGrip) {
      gripBindingMarker.visible = false;
      return;
    }
    if (!componentGrip.localPoint.equals(piece.gripOffset)) piece.gripOffset.copy(componentGrip.localPoint);
    marker = buildCompoundGripPlacementMarkerGeometry(
      componentGrip,
      componentGrip.localPoint,
      piece.gripNormal,
      avatarHandGripFootprint.x,
      avatarHandGripFootprint.y,
      piece.gripAngle ?? 0,
    );
  } else {
    marker = buildGripPlacementMarkerGeometry(
      piece,
      piece.gripOffset,
      piece.gripNormal,
      avatarHandGripFootprint.x,
      avatarHandGripFootprint.y,
      piece.gripAngle ?? 0,
    );
  }
  gripBindingMarker.visible = true;
  gripBindingMarker.position.copy(piece.mesh.position);
  gripBindingMarker.rotation.set(0, 0, 0);
  gripBindingMarker.scale.set(1, 1, 1);
  gripBindingSurface.geometry.dispose();
  gripBindingLines.geometry.dispose();
  gripBindingSurface.geometry = positionsGeometry(marker.surface);
  gripBindingLines.geometry = positionsGeometry(marker.lines);
}

function positionsGeometry(positions) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function gripSurfaceCellForLocalPoint(piece, localPoint, normal) {
  const direct = surfaceCellFromLocalPoint(piece, localPoint, normal);
  if (direct && isExposedSurfaceCell(piece, direct, normal)) {
    return {
      cell: direct,
      localPoint: surfacePointForCell(piece, direct, normal, localPoint),
      source: "direct",
    };
  }
  return nearestExposedSurfaceCell(piece, localPoint, normal);
}

function nearestExposedSurfaceCell(piece, localPoint, normal) {
  if (!piece?.solid || !localPoint || !normal) return null;
  const normalAxis = dominantAxis(normal);
  const tangentAxes = [0, 1, 2].filter((axis) => axis !== normalAxis);
  const dims = [piece.dims.x, piece.dims.y, piece.dims.z];
  const grid = [piece.grid.x, piece.grid.y, piece.grid.z];
  const cellSize = dims.map((size, axis) => size / grid[axis]);
  const searchRadius = Math.max(avatarHandGripFootprint.x, avatarHandGripFootprint.y) * 0.72;
  const searchRadiusSq = searchRadius * searchRadius;
  const normalTolerance = Math.max(cellSize[normalAxis] * 2.2, avatarHandGripSize.z * 0.55);
  const cells = piece.solidCells ?? solidCellsFor(piece);
  let best = null;
  let bestScore = Infinity;

  for (const cell of cells) {
    if (!isExposedSurfaceCell(piece, cell, normal)) continue;
    const surfacePoint = surfacePointForCell(piece, cell, normal, localPoint);
    const da = surfacePoint.getComponent(tangentAxes[0]) - localPoint.getComponent(tangentAxes[0]);
    const db = surfacePoint.getComponent(tangentAxes[1]) - localPoint.getComponent(tangentAxes[1]);
    const tangentDistanceSq = da * da + db * db;
    if (tangentDistanceSq > searchRadiusSq) continue;
    const normalDistance = Math.abs(surfacePoint.getComponent(normalAxis) - localPoint.getComponent(normalAxis));
    if (normalDistance > normalTolerance) continue;
    const score = tangentDistanceSq + normalDistance * normalDistance * 0.35;
    if (score < bestScore) {
      bestScore = score;
      best = {
        cell,
        localPoint: surfacePoint,
        source: "nearest",
      };
    }
  }
  return best;
}

function surfacePointForCell(piece, cell, normal, referencePoint) {
  const normalAxis = dominantAxis(normal);
  const sign = Math.sign(normal.getComponent(normalAxis)) || 1;
  const dims = [piece.dims.x, piece.dims.y, piece.dims.z];
  const grid = [piece.grid.x, piece.grid.y, piece.grid.z];
  const coordinate = [referencePoint.x, referencePoint.y, referencePoint.z];
  coordinate[normalAxis] = -dims[normalAxis] * 0.5 +
    (sign > 0 ? cell[normalAxis] + 1 : cell[normalAxis]) * dims[normalAxis] / grid[normalAxis];
  for (const axis of [0, 1, 2]) {
    if (axis === normalAxis) continue;
    const min = -dims[axis] * 0.5 + cell[axis] * dims[axis] / grid[axis];
    const max = -dims[axis] * 0.5 + (cell[axis] + 1) * dims[axis] / grid[axis];
    coordinate[axis] = THREE.MathUtils.clamp(coordinate[axis], min, max);
  }
  return new THREE.Vector3(coordinate[0], coordinate[1], coordinate[2]);
}

function voxelGripContactAreaForPatches(piece, patches) {
  if (!piece || piece.components || piece.appearance || !Array.isArray(patches) || !patches.length) return null;
  let primaryArea = 0;
  let foldedArea = 0;
  for (const patch of patches) {
    const area = voxelGripPatchContactArea(piece, patch);
    if (patch.folded) foldedArea += area;
    else primaryArea += area;
  }
  return {
    primaryArea,
    foldedArea,
    contactArea: primaryArea + foldedArea,
  };
}

function voxelGripPatchContactArea(piece, patch) {
  if (!patch?.corners?.length || !patch.normal) return 0;
  const normal = patch.normal.clone().normalize();
  const normalAxis = dominantAxis(normal);
  const sign = Math.sign(normal.getComponent(normalAxis)) || 1;
  const tangentAxes = [0, 1, 2].filter((axis) => axis !== normalAxis);
  const patchRangeA = vectorRangeOnAxis(patch.corners, tangentAxes[0]);
  const patchRangeB = vectorRangeOnAxis(patch.corners, tangentAxes[1]);
  if (patchRangeA.max <= patchRangeA.min || patchRangeB.max <= patchRangeB.min) return 0;

  const dims = [piece.dims.x, piece.dims.y, piece.dims.z];
  const grid = [piece.grid.x, piece.grid.y, piece.grid.z];
  const cellSize = dims.map((size, axis) => size / grid[axis]);
  const visualPlane = patch.corners.reduce((sum, corner) => sum + corner.getComponent(normalAxis), 0) / patch.corners.length;
  const targetPlane = visualPlane - sign * gripContactVisualOffset;
  const planeTolerance = Math.max(cellSize[normalAxis] * 0.55, gripContactVisualOffset * 2.25);
  const conformDepth = Math.max(gripContactConformDepth, cellSize[normalAxis] * 2.5);
  const cells = piece.solidCells ?? solidCellsFor(piece);
  let area = 0;

  for (const cell of cells) {
    if (!isExposedSurfaceCell(piece, cell, normal)) continue;
    const facePlane = -dims[normalAxis] * 0.5 +
      (sign > 0 ? cell[normalAxis] + 1 : cell[normalAxis]) * cellSize[normalAxis];
    const inwardDepth = sign * (targetPlane - facePlane);
    if (inwardDepth < -planeTolerance || inwardDepth > conformDepth + planeTolerance) continue;

    const cellRangeA = cellRangeOnAxis(piece, cell, tangentAxes[0]);
    const cellRangeB = cellRangeOnAxis(piece, cell, tangentAxes[1]);
    const overlapA = rangeOverlapSize(patchRangeA, cellRangeA);
    const overlapB = rangeOverlapSize(patchRangeB, cellRangeB);
    area += overlapA * overlapB;
  }

  return Math.min(area, Math.max(0, patch.area ?? area));
}

function vectorRangeOnAxis(points, axis) {
  let min = Infinity;
  let max = -Infinity;
  for (const point of points) {
    const value = point.getComponent(axis);
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max };
}

function cellRangeOnAxis(piece, cell, axis) {
  const size = piece.dims.getComponent(axis);
  const count = piece.grid[axisKey(axis)];
  return {
    min: -size * 0.5 + cell[axis] * size / count,
    max: -size * 0.5 + (cell[axis] + 1) * size / count,
  };
}

function rangeOverlapSize(a, b) {
  return Math.max(0, Math.min(a.max, b.max) - Math.max(a.min, b.min));
}

function surfaceCellFromLocalPoint(piece, localPoint, normal) {
  const inset = localPoint.clone().add(normal.clone().multiplyScalar(-0.0008));
  const cell = [0, 0, 0];
  for (let axis = 0; axis < 3; axis++) cell[axis] = localCoordinateToVoxel(piece, axis, inset.getComponent(axis));
  if (!isSolid(piece, cell[0], cell[1], cell[2])) return null;
  return cell;
}

function isExposedSurfaceCell(piece, cell, normal) {
  if (!isSolid(piece, cell[0], cell[1], cell[2])) return false;
  const axis = dominantAxis(normal);
  const side = Math.sign(normal.getComponent(axis)) || 1;
  const neighbor = [...cell];
  neighbor[axis] += side;
  return !isSolid(piece, neighbor[0], neighbor[1], neighbor[2]);
}

function buildFaceCellMarkerGeometry(piece, cell, normal) {
  const surface = [];
  const lines = [];
  const corners = cellFaceCorners(piece, cell, normal, 0.006);
  pushFace(surface, [], corners, [normal.x, normal.y, normal.z]);
  pushLineLoop(lines, corners);
  return { surface, lines };
}

function buildSawMarkerGeometry(piece, hitCell, normal) {
  const normalAxis = dominantAxis(normal);
  const tangentAxes = [0, 1, 2].filter((axis) => axis !== normalAxis);
  const lines = [];
  const angle = toolSettings.saw.angle;

  for (let a = 0; a < piece.grid[axisKey(tangentAxes[0])]; a++) {
    for (let b = 0; b < piece.grid[axisKey(tangentAxes[1])]; b++) {
      const cell = [...hitCell];
      cell[tangentAxes[0]] = a;
      cell[tangentAxes[1]] = b;
      if (!sawCellOnLine(cell, hitCell, tangentAxes, angle) || !isExposedSurfaceCell(piece, cell, normal)) continue;
      const segment = angledCellLineSegment(piece, cell, normal, tangentAxes, angle, 0.008);
      pushLine(lines, segment.start, segment.end);
    }
  }
  return lines.length ? { surface: [], lines } : buildFaceCellMarkerGeometry(piece, hitCell, normal);
}

function buildDrillMarkerGeometry(piece, hitCell, normal) {
  const normalAxis = dominantAxis(normal);
  const tangentAxes = [0, 1, 2].filter((axis) => axis !== normalAxis);
  const surface = [];
  const lines = [];
  const halfWidth = Math.floor(toolSettings.drill.size / 2);
  for (let a = hitCell[tangentAxes[0]] - halfWidth; a <= hitCell[tangentAxes[0]] + halfWidth; a++) {
    for (let b = hitCell[tangentAxes[1]] - halfWidth; b <= hitCell[tangentAxes[1]] + halfWidth; b++) {
      const cell = [...hitCell];
      cell[tangentAxes[0]] = a;
      cell[tangentAxes[1]] = b;
      if (!isExposedSurfaceCell(piece, cell, normal)) continue;
      const corners = cellFaceCorners(piece, cell, normal, 0.009);
      pushFace(surface, [], corners, [normal.x, normal.y, normal.z]);
      pushLineLoop(lines, corners);
    }
  }
  return surface.length || lines.length ? { surface, lines } : buildFaceCellMarkerGeometry(piece, hitCell, normal);
}

function cellFaceCorners(piece, cell, normal, lift = 0) {
  const axis = dominantAxis(normal);
  const sign = Math.sign(normal.getComponent(axis)) || 1;
  const dims = [piece.dims.x, piece.dims.y, piece.dims.z];
  const grid = [piece.grid.x, piece.grid.y, piece.grid.z];
  const min = cell.map((value, index) => -dims[index] * 0.5 + value * dims[index] / grid[index]);
  const max = cell.map((value, index) => -dims[index] * 0.5 + (value + 1) * dims[index] / grid[index]);
  const face = sign > 0 ? max[axis] : min[axis];
  const lifted = face + sign * lift;
  const axes = [0, 1, 2].filter((item) => item !== axis);
  const points = [
    [min[axes[0]], min[axes[1]]],
    [max[axes[0]], min[axes[1]]],
    [max[axes[0]], max[axes[1]]],
    [min[axes[0]], max[axes[1]]],
  ];
  return points.map(([a, b]) => {
    const coordinate = [0, 0, 0];
    coordinate[axis] = lifted;
    coordinate[axes[0]] = a;
    coordinate[axes[1]] = b;
    return coordinate;
  });
}

function cellCenterLineSegment(piece, cell, normal, lineAxis, lift = 0) {
  const normalAxis = dominantAxis(normal);
  const crossAxis = [0, 1, 2].find((axis) => axis !== normalAxis && axis !== lineAxis);
  const dims = [piece.dims.x, piece.dims.y, piece.dims.z];
  const grid = [piece.grid.x, piece.grid.y, piece.grid.z];
  const normalSign = Math.sign(normal.getComponent(normalAxis)) || 1;
  const coordinate = [0, 0, 0];
  coordinate[normalAxis] = -dims[normalAxis] * 0.5 + (normalSign > 0 ? cell[normalAxis] + 1 : cell[normalAxis]) * dims[normalAxis] / grid[normalAxis] + normalSign * lift;
  coordinate[crossAxis] = -dims[crossAxis] * 0.5 + (cell[crossAxis] + 0.5) * dims[crossAxis] / grid[crossAxis];
  const start = [...coordinate];
  const end = [...coordinate];
  start[lineAxis] = -dims[lineAxis] * 0.5 + cell[lineAxis] * dims[lineAxis] / grid[lineAxis];
  end[lineAxis] = -dims[lineAxis] * 0.5 + (cell[lineAxis] + 1) * dims[lineAxis] / grid[lineAxis];
  return { start, end };
}

function angledCellLineSegment(piece, cell, normal, tangentAxes, angleDeg, lift = 0) {
  const normalAxis = dominantAxis(normal);
  const dims = [piece.dims.x, piece.dims.y, piece.dims.z];
  const grid = [piece.grid.x, piece.grid.y, piece.grid.z];
  const normalSign = Math.sign(normal.getComponent(normalAxis)) || 1;
  const angle = THREE.MathUtils.degToRad(angleDeg);
  const cellSize = [
    dims[tangentAxes[0]] / grid[tangentAxes[0]],
    dims[tangentAxes[1]] / grid[tangentAxes[1]],
  ];
  const tangent = new THREE.Vector2(Math.cos(angle) * cellSize[0], Math.sin(angle) * cellSize[1]).normalize();
  const length = Math.hypot(cellSize[0], cellSize[1]) * 0.78;
  const center = [0, 0, 0];
  center[normalAxis] = -dims[normalAxis] * 0.5 + (normalSign > 0 ? cell[normalAxis] + 1 : cell[normalAxis]) * dims[normalAxis] / grid[normalAxis] + normalSign * lift;
  center[tangentAxes[0]] = -dims[tangentAxes[0]] * 0.5 + (cell[tangentAxes[0]] + 0.5) * cellSize[0];
  center[tangentAxes[1]] = -dims[tangentAxes[1]] * 0.5 + (cell[tangentAxes[1]] + 0.5) * cellSize[1];
  const start = [...center];
  const end = [...center];
  start[tangentAxes[0]] -= tangent.x * length * 0.5;
  start[tangentAxes[1]] -= tangent.y * length * 0.5;
  end[tangentAxes[0]] += tangent.x * length * 0.5;
  end[tangentAxes[1]] += tangent.y * length * 0.5;
  return { start, end };
}

function pushLineLoop(lines, corners) {
  for (let index = 0; index < corners.length; index++) pushLine(lines, corners[index], corners[(index + 1) % corners.length]);
}

function pushLine(lines, start, end) {
  lines.push(...start, ...end);
}

function triggerHammer(point, normal) {
  hammer.visible = true;
  const approach = normal.clone().multiplyScalar(-1).normalize();
  const baseQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), approach);
  const viewDirection = camera.position.clone().sub(point).normalize();
  const visibleTangent = viewDirection.sub(normal.clone().multiplyScalar(viewDirection.dot(normal)));
  if (visibleTangent.lengthSq() < 0.0001) visibleTangent.set(0, 0, 1);
  visibleTangent.normalize();
  const contactPoint = point.clone().add(visibleTangent.multiplyScalar(0.42));
  strike = {
    elapsed: 0,
    contactPoint,
    impactGrip: contactPoint.clone().sub(hammer.userData.strikePoint.clone().applyQuaternion(baseQuaternion)),
    baseQuaternion,
    strikePoint: hammer.userData.strikePoint.clone(),
  };
}

function beginShapeToolAction() {
  if (!pieces.length) {
    setStatus("forging.status.empty");
    return null;
  }

  const target = toolTargetFromPointer();
  if (!target) {
    setStatus("forging.status.miss");
    return null;
  }

  const { piece, point, localPoint, normal } = target;
  if (piece.components) {
    setStatus("forging.status.castLocked");
    return null;
  }
  selectPiece(piece);
  const action = sawEnabled
    ? createSawAction(piece, point, localPoint, normal)
    : createDrillAction(piece, point, localPoint, normal);
  applyShapeToolStep(action);
  return action;
}

function toolTargetFromPointer(options = {}) {
  const allowSelectedFallback = options.allowSelectedFallback ?? true;
  const preferSelected = options.preferSelected ?? false;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(selectableMeshes, false);
  const selectedHit = preferSelected && selectedPiece
    ? hits.find((item) => pieceFromObject(item.object) === selectedPiece)
    : null;
  const hit = selectedHit ?? hits[0];
  if (hit) {
    const piece = pieceFromObject(hit.object);
    if (!piece) return null;
    const normal = hit.face.normal.clone().transformDirection(piece.mesh.matrixWorld).round();
    return {
      piece,
      point: hit.point.clone(),
      localPoint: piece.mesh.worldToLocal(hit.point.clone()),
      normal,
    };
  }

  if (!allowSelectedFallback || !selectedPiece || selectedPiece.components) return null;
  const normal = visibleFaceNormal(selectedPiece);
  const point = selectedPiece.mesh.position.clone().add(new THREE.Vector3(
    normal.x * selectedPiece.dims.x * 0.5,
    normal.y * selectedPiece.dims.y * 0.5,
    normal.z * selectedPiece.dims.z * 0.5,
  ));
  return {
    piece: selectedPiece,
    point,
    localPoint: selectedPiece.mesh.worldToLocal(point.clone()),
    normal,
  };
}

function visibleFaceNormal(piece) {
  const view = camera.position.clone().sub(piece.mesh.position);
  const axis = dominantAxis(view);
  const normal = new THREE.Vector3();
  normal.setComponent(axis, Math.sign(view.getComponent(axis)) || 1);
  return normal;
}

function createSawAction(piece, point, localPoint, normal) {
  const normalAxis = dominantAxis(normal);
  const tangentAxes = [0, 1, 2].filter((axis) => axis !== normalAxis);
  return {
    type: "saw",
    elapsed: 0,
    stepTimer: 0,
    depth: -1,
    piece,
    point: point.clone(),
    normal: normal.clone(),
    normalAxis,
    tangentAxes,
    center: tangentAxes.map((axis) => localCoordinateToVoxel(piece, axis, localPoint.getComponent(axis))),
    angle: toolSettings.saw.angle,
    done: false,
  };
}

function createDrillAction(piece, point, localPoint, normal) {
  const normalAxis = dominantAxis(normal);
  const tangentAxes = [0, 1, 2].filter((axis) => axis !== normalAxis);
  return {
    type: "drill",
    elapsed: 0,
    stepTimer: 0,
    depth: -1,
    piece,
    point: point.clone(),
    normal: normal.clone(),
    normalAxis,
    tangentAxes,
    center: tangentAxes.map((axis) => localCoordinateToVoxel(piece, axis, localPoint.getComponent(axis))),
    size: toolSettings.drill.size,
    done: false,
  };
}

function applyShapeToolStep(action) {
  if (!action || action.done) return;
  action.depth += 1;
  const maxDepth = action.piece.grid[axisKey(action.normalAxis)];
  if (action.depth >= maxDepth) {
    action.done = true;
    setStatus(action.type === "saw" ? "forging.status.sawComplete" : "forging.status.drillThrough");
    return;
  }

  const removed = action.type === "saw" ? removeSawLayer(action) : removeDrillLayer(action);
  if (removed) {
    action.modified = true;
    refreshPieceGeometry(action.piece);
    updatePiece(action.piece);
    updateHud();
    if (action.depth >= maxDepth - 1) {
      action.done = true;
      setStatus(action.type === "saw" ? "forging.status.sawComplete" : "forging.status.drillThrough");
    } else {
      setStatus(action.type === "saw" ? "forging.status.sawCut" : "forging.status.drillCut");
    }
  } else if (action.depth >= maxDepth - 1) {
    action.done = true;
    setStatus(action.type === "saw" ? "forging.status.sawComplete" : "forging.status.drillThrough");
  }
}

function finishShapeToolAction() {
  if (!toolAction) return;
  const action = toolAction;
  toolAction = null;
  saw.visible = false;
  handDrill.visible = false;
  if (!action.modified || !action.piece || action.piece.components) return;

  const result = rebuildPieceFromLargestSolidIsland(action.piece);
  if (result === "removed") {
    setStatus("forging.status.pieceRemoved");
    updateHud();
    return;
  }
  if (result === "rebuilt") {
    if (selectedTool !== "gloves") settleAllPieces();
    setStatus("forging.status.shapeSettled");
  }
}

function rebuildPieceFromLargestSolidIsland(piece) {
  const island = largestSolidIsland(piece);
  if (!island.cells.length) {
    removePiece(piece);
    return "removed";
  }

  const totalSolid = piece.solidCells?.length ?? solidCellsFor(piece).length;
  if (island.cells.length === totalSolid && island.fillsGrid) return "unchanged";

  const oldGrid = piece.grid;
  const oldDims = piece.dims.clone();
  const min = island.min;
  const max = island.max;
  const cropCells = [
    max[0] - min[0] + 1,
    max[1] - min[1] + 1,
    max[2] - min[2] + 1,
  ];
  const oldCell = [
    oldDims.x / oldGrid.x,
    oldDims.y / oldGrid.y,
    oldDims.z / oldGrid.z,
  ];
  const nextDims = new THREE.Vector3(
    cropCells[0] * oldCell[0],
    cropCells[1] * oldCell[1],
    cropCells[2] * oldCell[2],
  );
  const localCenter = new THREE.Vector3(
    -oldDims.x * 0.5 + (min[0] + cropCells[0] * 0.5) * oldCell[0],
    -oldDims.y * 0.5 + (min[1] + cropCells[1] * 0.5) * oldCell[1],
    -oldDims.z * 0.5 + (min[2] + cropCells[2] * 0.5) * oldCell[2],
  );

  const nextGrid = { ...voxelGrid };
  const nextSolid = new Uint8Array(nextGrid.x * nextGrid.y * nextGrid.z);
  const islandSet = new Set(island.cells.map(cellKey));
  for (let z = 0; z < nextGrid.z; z++) {
    for (let y = 0; y < nextGrid.y; y++) {
      for (let x = 0; x < nextGrid.x; x++) {
        const sourceCell = [
          resampleIslandCell(x, min[0], cropCells[0], nextGrid.x),
          resampleIslandCell(y, min[1], cropCells[1], nextGrid.y),
          resampleIslandCell(z, min[2], cropCells[2], nextGrid.z),
        ];
        if (islandSet.has(cellKey(sourceCell))) nextSolid[voxelIndex(nextGrid, x, y, z)] = 1;
      }
    }
  }

  piece.grid = nextGrid;
  piece.solid = nextSolid;
  piece.dims.copy(nextDims);
  piece.offset.add(localCenter);
  if (piece.gripOffset) piece.gripOffset.sub(localCenter);
  refreshPieceGeometry(piece);
  updatePiece(piece);
  updateHud();
  return "rebuilt";
}

function resampleIslandCell(value, min, cropSize, nextSize) {
  const normalized = (value + 0.5) / nextSize;
  return min + THREE.MathUtils.clamp(Math.floor(normalized * cropSize), 0, cropSize - 1);
}

function largestSolidIsland(piece) {
  const cells = piece.solidCells ?? solidCellsFor(piece);
  const solid = new Set(cells.map(cellKey));
  const visited = new Set();
  let best = [];
  for (const cell of cells) {
    const startKey = cellKey(cell);
    if (visited.has(startKey)) continue;
    const island = [];
    const pending = [cell];
    visited.add(startKey);
    while (pending.length) {
      const current = pending.pop();
      island.push(current);
      for (const next of neighborCells(current)) {
        const key = cellKey(next);
        if (!solid.has(key) || visited.has(key)) continue;
        visited.add(key);
        pending.push(next);
      }
    }
    if (island.length > best.length) best = island;
  }

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const cell of best) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], cell[axis]);
      max[axis] = Math.max(max[axis], cell[axis]);
    }
  }
  const fillsGrid = best.length > 0 &&
    min[0] === 0 && min[1] === 0 && min[2] === 0 &&
    max[0] === piece.grid.x - 1 && max[1] === piece.grid.y - 1 && max[2] === piece.grid.z - 1;
  return { cells: best, min, max, fillsGrid };
}

function neighborCells(cell) {
  return [
    [cell[0] + 1, cell[1], cell[2]],
    [cell[0] - 1, cell[1], cell[2]],
    [cell[0], cell[1] + 1, cell[2]],
    [cell[0], cell[1] - 1, cell[2]],
    [cell[0], cell[1], cell[2] + 1],
    [cell[0], cell[1], cell[2] - 1],
  ];
}

function cellKey(cell) {
  return `${cell[0]},${cell[1]},${cell[2]}`;
}

function removePiece(piece) {
  const index = pieces.indexOf(piece);
  if (index >= 0) pieces.splice(index, 1);
  const meshIndex = selectableMeshes.indexOf(piece.mesh);
  if (meshIndex >= 0) selectableMeshes.splice(meshIndex, 1);
  scene.remove(piece.mesh, piece.edges);
  disposePiece(piece);
  if (selectedPiece === piece) selectedPiece = null;
  syncUsedBackpackMaterialEntriesFromWorkbench();
  updateMoveGizmo();
  updateGripBindingMarker();
  markEquipmentPreviewDirty();
  faceMarker.visible = false;
}

function removeSawLayer(action) {
  const { piece, normalAxis, tangentAxes, center, angle } = action;
  const layer = depthToVoxelLayer(piece, normalAxis, action.normal.getComponent(normalAxis), action.depth);
  let removed = false;
  for (let a = 0; a < piece.grid[axisKey(tangentAxes[0])]; a++) {
    for (let b = 0; b < piece.grid[axisKey(tangentAxes[1])]; b++) {
      const coordinate = [0, 0, 0];
      coordinate[normalAxis] = layer;
      coordinate[tangentAxes[0]] = a;
      coordinate[tangentAxes[1]] = b;
      if (!sawCellOnLine(coordinate, center, tangentAxes, angle)) continue;
      removed = setSolid(piece, coordinate[0], coordinate[1], coordinate[2], 0) || removed;
    }
  }
  return removed;
}

function sawCellOnLine(cell, center, tangentAxes, angleDeg) {
  const angle = THREE.MathUtils.degToRad(angleDeg);
  const cross = new THREE.Vector2(-Math.sin(angle), Math.cos(angle));
  const centerA = center.length === 2 ? center[0] : center[tangentAxes[0]];
  const centerB = center.length === 2 ? center[1] : center[tangentAxes[1]];
  const delta = new THREE.Vector2(
    cell[tangentAxes[0]] - centerA,
    cell[tangentAxes[1]] - centerB,
  );
  return Math.abs(delta.dot(cross)) <= 0.5;
}

function removeDrillLayer(action) {
  const { piece, normalAxis, tangentAxes, center, size } = action;
  const layer = depthToVoxelLayer(piece, normalAxis, action.normal.getComponent(normalAxis), action.depth);
  let removed = false;
  const halfWidth = Math.floor(size / 2);
  for (let a = center[0] - halfWidth; a <= center[0] + halfWidth; a++) {
    for (let b = center[1] - halfWidth; b <= center[1] + halfWidth; b++) {
      const coordinate = [0, 0, 0];
      coordinate[normalAxis] = layer;
      coordinate[tangentAxes[0]] = a;
      coordinate[tangentAxes[1]] = b;
      removed = setSolid(piece, coordinate[0], coordinate[1], coordinate[2], 0) || removed;
    }
  }
  return removed;
}

function localCoordinateToVoxel(piece, axis, value) {
  const key = axisKey(axis);
  const size = piece.dims.getComponent(axis);
  const normalized = (value + size * 0.5) / size;
  return THREE.MathUtils.clamp(Math.floor(normalized * piece.grid[key]), 0, piece.grid[key] - 1);
}

function depthToVoxelLayer(piece, axis, sign, depth) {
  const max = piece.grid[axisKey(axis)] - 1;
  return sign > 0 ? max - depth : depth;
}

function axisKey(axis) {
  return ["x", "y", "z"][axis];
}

function placeToolAction(action) {
  if (!action) return;
  if (action.type === "saw") {
    const lineDirection = sawWorldDirection(action.tangentAxes, action.angle);
    const normal = action.normal.clone().normalize();
    const side = new THREE.Vector3().crossVectors(lineDirection, normal).normalize();
    const matrix = new THREE.Matrix4().makeBasis(lineDirection, normal, side);
    const travel = Math.sin(action.elapsed * 28) * 0.24;
    saw.visible = true;
    saw.position.copy(action.point)
      .add(normal.clone().multiplyScalar(0.18))
      .add(lineDirection.clone().multiplyScalar(travel));
    saw.quaternion.setFromRotationMatrix(matrix);
    return;
  }

  const approach = action.normal.clone().multiplyScalar(-1).normalize();
  const baseQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), approach);
  const pulse = 0.06 + Math.sin(action.elapsed * 22) * 0.025;
  handDrill.visible = true;
  handDrill.position.copy(action.point)
    .add(action.normal.clone().multiplyScalar(0.36))
    .add(approach.multiplyScalar(pulse));
  handDrill.quaternion.copy(baseQuaternion);
  handDrill.userData.bit.rotation.x += 0.7;
}

function sawWorldDirection(tangentAxes, angleDeg) {
  const angle = THREE.MathUtils.degToRad(angleDeg);
  return axisVectorByIndex(tangentAxes[0])
    .multiplyScalar(Math.cos(angle))
    .add(axisVectorByIndex(tangentAxes[1]).multiplyScalar(Math.sin(angle)))
    .normalize();
}

function createMoveDrag(event, options = {}) {
  const allowPlaneDrag = options.allowPlaneDrag ?? true;
  raycaster.setFromCamera(pointer, camera);
  const handleHit = raycaster.intersectObjects(moveHandles, false)[0];
  if (handleHit?.object.userData.axis) {
    const axis = handleHit.object.userData.axis;
    const worldAxis = axisVector(axis);
    const startScreen = projectToScreen(selectedPiece.mesh.position);
    const endScreen = projectToScreen(selectedPiece.mesh.position.clone().add(worldAxis));
    const screenAxis = endScreen.clone().sub(startScreen);
    const pixelsPerUnit = Math.max(8, screenAxis.length());
    screenAxis.normalize();
    return {
      type: "axis",
      axis,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      piece: selectedPiece,
      startOffset: selectedPiece.offset.clone(),
      screenAxis,
      pixelsPerUnit,
    };
  }

  const pieceHit = raycaster.intersectObjects(selectableMeshes, false)[0];
  if (pieceHit) {
    const nextPiece = pieceFromObject(pieceHit.object);
    if (nextPiece) selectPiece(nextPiece);
  }

  if (!pieceHit) {
    selectPiece(null);
    if (!allowPlaneDrag) return null;
    return null;
  }

  const dragPoint = intersectPointerPlane(selectedPiece.mesh.position.y);
  if (!dragPoint) return null;
  return {
    type: "plane",
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    piece: selectedPiece,
    startOffset: selectedPiece.offset.clone(),
    startPoint: dragPoint,
  };
}

function updateMoveDrag(event) {
  if (!activeDrag) return;

  if (activeDrag.type === "axis") {
    const mouseDelta = new THREE.Vector2(event.clientX - activeDrag.startX, event.clientY - activeDrag.startY);
    const units = mouseDelta.dot(activeDrag.screenAxis) / activeDrag.pixelsPerUnit;
    const nextOffset = activeDrag.startOffset.clone();
    nextOffset[activeDrag.axis] = clampOffset(activeDrag.axis, activeDrag.startOffset[activeDrag.axis] + units);
    movePiece(activeDrag.piece, nextOffset);
    return;
  }

  const dragPoint = intersectPointerPlane(activeDrag.piece.mesh.position.y);
  if (!dragPoint) return;
  const delta = dragPoint.sub(activeDrag.startPoint);
  const nextOffset = activeDrag.startOffset.clone();
  nextOffset.x = clampOffset("x", activeDrag.startOffset.x + delta.x);
  nextOffset.z = clampOffset("z", activeDrag.startOffset.z + delta.z);
  movePiece(activeDrag.piece, nextOffset);
}

function updateMoveGizmo() {
  moveGizmo.visible = Boolean(selectedPiece && moveEnabled);
  if (!moveGizmo.visible) return;
  moveGizmo.position.copy(selectedPiece.mesh.position);
  const scale = Math.max(0.8, Math.min(1.35, distance * 0.12));
  moveGizmo.scale.setScalar(scale);
}

function intersectPointerPlane(y) {
  raycaster.setFromCamera(pointer, camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
  const point = new THREE.Vector3();
  return raycaster.ray.intersectPlane(plane, point);
}

function projectToScreen(worldPosition) {
  const rect = canvas.getBoundingClientRect();
  const projected = worldPosition.clone().project(camera);
  return new THREE.Vector2(
    ((projected.x + 1) * 0.5) * rect.width + rect.left,
    ((1 - projected.y) * 0.5) * rect.height + rect.top,
  );
}

function axisVector(axis) {
  if (axis === "x") return new THREE.Vector3(1, 0, 0);
  if (axis === "y") return new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3(0, 0, 1);
}

function axisVectorByIndex(axis) {
  if (axis === 0) return new THREE.Vector3(1, 0, 0);
  if (axis === 1) return new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3(0, 0, 1);
}

function clampOffset(axis, value) {
  return value;
}

function dominantAxis(vector) {
  const absolute = [Math.abs(vector.x), Math.abs(vector.y), Math.abs(vector.z)];
  return absolute.indexOf(Math.max(...absolute));
}

function setStatus(key) {
  statusText.dataset.statusKey = key;
  statusText.textContent = t(key);
}

function resetCamera() {
  yaw = -0.72;
  pitch = 0.38;
  target.set(-1.8, 1.1, -1.35);
  distance = 13.2;
  updateCamera();
}

function updateCamera() {
  camera.position.set(
    target.x + Math.sin(yaw) * Math.cos(pitch) * distance,
    target.y + Math.sin(pitch) * distance,
    target.z + Math.cos(yaw) * Math.cos(pitch) * distance,
  );
  camera.lookAt(target);
  updateMoveGizmo();
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const elapsed = clock.elapsedTime;
  if (forgeFireBlocks.length) {
    const pulse = 1 + Math.sin(elapsed * 4.2) * 0.08;
    forgeFireBlocks.forEach((block, index) => {
      const offsetPulse = pulse + Math.sin(elapsed * 5.1 + index) * 0.035;
      block.scale.setScalar(offsetPulse);
      if (block.material?.opacity !== undefined) block.material.opacity = 0.72 + Math.sin(elapsed * 4.8 + index) * 0.12;
    });
    forgeFireLight.intensity = 2.1 + Math.sin(elapsed * 4.2) * 0.45;
  }
  if (toolAction) {
    toolAction.elapsed += Math.min(dt, 1 / 30);
    toolAction.stepTimer += dt;
    if (toolAction.stepTimer >= 0.09) {
      toolAction.stepTimer = 0;
      applyShapeToolStep(toolAction);
    }
    placeToolAction(toolAction);
  }
  if (strike) {
    strike.elapsed += Math.min(dt, 1 / 60);
    const progress = Math.min(1, strike.elapsed / 0.55);
    const angle = progress < 0.62
      ? THREE.MathUtils.lerp(-0.58, 0, progress / 0.62)
      : THREE.MathUtils.lerp(0, -0.2, (progress - 0.62) / 0.38);
    const swing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle);
    hammer.quaternion.copy(strike.baseQuaternion).multiply(swing);
    hammer.position.copy(strike.impactGrip);
    if (progress >= 1) {
      strike = null;
      hammer.visible = false;
    }
  }
  if (hoveredFace) placeFaceMarker(hoveredFace);
  updateForgeAvatar();
  updateGripFailureAnimations(dt);
  updateGripCollisionAttemptAnimations(dt);
  updateGripCollisionFlashAnimations(dt);
  updateAvatarCollisionProbeFlashAnimations(dt);
  updateAvatarCollisionPartFlashAnimations(dt);
  renderer.render(scene, camera);
}
