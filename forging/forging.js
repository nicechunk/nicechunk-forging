import * as THREE from "three";
import "../src/site-header.css";
import "../src/site-ui.js";
import { initI18n, t } from "../src/i18n.js";
import { forgeEquipmentOnChain, getEquippedBackpackStatus, loadCachedGlobalConfig } from "../src/chain/nicechunkChain.js";
import {
  commitForgedHotbarReservation,
  releaseForgedHotbarReservation,
  reserveForgedHotbarSlot,
} from "../src/items/hotbar.js";
import {
  SMELTING_MATERIAL_ATTRIBUTE_KEYS,
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
import {
  appendGreedyVoxelGeometry,
  appendSolidCuboidGeometry,
} from "../src/render/voxelGreedyMesh.js";
import { createChunkGroup, createCloudSectorGroup } from "../src/world/chunks.js";
import { applyWorldConfigFromChain, chunkSize, cloudSectorSize, seaLevel } from "../src/world/config.js";
import { canonicalSurfaceHeightAt, canonicalWaterLevelAt, setCanonicalWorldConfig } from "../src/world/canonicalResource.js";
import { setWorldSeed } from "../src/world/generator.js";
import { createWorldGeometryByType, createWorldMaterials } from "../src/world/rendering.js";
import { defaultWorldSeed, readPlayWorldSeed } from "../src/world/seedStorage.js";
import { createWorldState } from "../src/world/state.js";

const canvas = document.querySelector("#forgeScene");
const statusText = document.querySelector("#statusText");
const shapeText = document.querySelector("#shapeText");
const resetCameraButton = document.querySelector("#resetCamera");
const randomForgeLocationButton = document.querySelector("#randomForgeLocation");
const forgeLocationText = document.querySelector("#forgeLocationText");
const hammerModeButton = document.querySelector("#hammerMode");
const resourceGrid = document.querySelector("#resourceGrid");
const refreshMaterialsButton = document.querySelector("#refreshMaterials");
const materialDetailPanel = document.querySelector("#materialDetailPanel");
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
const forgeOnChainButton = document.querySelector("#forgeOnChain");
const copyChainCodeButton = document.querySelector("#copyChainCode");
const chainCodeOutput = document.querySelector("#chainCodeOutput");
const chainActionStatus = document.querySelector("#chainActionStatus");
const toolHotbar = document.querySelector("#toolHotbar");
const panelTabButtons = document.querySelectorAll("[data-forging-panel-tab]");
const panelTabPanels = {
  materials: document.querySelector("#materialsPanel"),
  properties: document.querySelector("#propertiesPanel"),
};

await initI18n();

const cachedWorldConfig = loadCachedGlobalConfig?.();
if (cachedWorldConfig) applyWorldConfigFromChain(cachedWorldConfig);
const forgeWorldSeed = cachedWorldConfig?.worldSeedHex ?? readPlayWorldSeed() ?? defaultWorldSeed;
setWorldSeed(forgeWorldSeed);
setCanonicalWorldConfig(cachedWorldConfig ?? { worldSeed: forgeWorldSeed });

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
  { id: "paintBrush", key: "forging.tool.paintBrush", hotkey: "7" },
  { id: "empty8", key: "forging.tool.empty", hotkey: "8", disabled: true },
  { id: "empty9", key: "forging.tool.empty", hotkey: "9", disabled: true },
];
const resourceIds = Object.keys(resources);
const forgeCodePrefix = "NCF1.";
const legacyAppearanceVersion = 3;
const forgeAppearanceVersion = 4;
const forgeEquipmentVersion = 5;
const forgeGripPoseVersion = 6;
const forgeGripNormalVersion = 7;
const forgeCompactStatsVersion = 8;
const forgeSolidShortcutVersion = 9;
const forgeZeroOffsetVersion = 10;
const forgeDefaultColorVersion = 11;
const forgeCutBoxSolidVersion = 12;
const forgeExtrudedMaskSolidVersion = 13;
const forgePaintVersion = 14;
const appearanceGrid = { x: 24, y: 24, z: 24 };
const forgeDraftsStorageKey = "nicechunk.forging.drafts.v1";
const activeForgeDraftStorageKey = "nicechunk.forging.activeDraft";
const forgeWorldLocationStorageKey = "nicechunk.forging.worldLocation.v1";
const maxForgeDrafts = 24;
const forgeGroundY = -0.72;
const forgeTerrainBlockTopOffset = 0.5;
const forgeLocalBottomY = -0.02;
const forgeWorldYOffset = forgeGroundY - forgeLocalBottomY;
const workpieceBaseY = 1.92 + forgeWorldYOffset;
const forgeTopY = 1.49 + forgeWorldYOffset;
const settleStep = 0.04;
const settleMaxSteps = 420;
const staticCollisionBoxes = [];
const staticSupportSurfaces = [
  { y: forgeTopY, minX: -1.68, maxX: 1.68, minZ: -1.68, maxZ: 1.68 },
  { y: forgeGroundY, minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity },
];
const forgeTerrainChunkRadius = 2;
const forgeTerrainDecoratedRadius = 1;
const forgeLocationSearchRadius = 96;
const forgeLocationRandomRange = 4096;
const forgeSiteMaxHeightDelta = 1;
const forgeSiteMaxSlope = 3;
const forgeSiteOffsets = [
  [0, 0],
  [-2, -2],
  [-2, 0],
  [-2, 2],
  [0, -2],
  [0, 2],
  [2, -2],
  [2, 0],
  [2, 2],
  [-4, -4],
  [-4, 4],
  [4, -4],
  [4, 4],
  [-7, -5],
  [-6, -4],
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
  ["paintBrush", toolCursorUrl("paintBrush")],
]);
const avatarHandGripSize = new THREE.Vector3(0.34, 0.42, 0.32);
const avatarHandGripFootprint = new THREE.Vector2(avatarHandGripSize.x, avatarHandGripSize.y);
const avatarGripHandAnchor = new THREE.Vector3(0, -0.99, 0);
const gripGestureRotationStepRadians = Math.PI / 2;
const gripContactVisualOffset = 0.012;
const gripContactConformDepth = avatarHandGripSize.z * 0.55;
const gripHandEmbedDepth = Math.min(avatarHandGripSize.z * 0.22, gripContactConformDepth * 0.45);
const minimumGripContactCoverage = 0.18;
const gravityMs2 = 9.80665;
const gripForceLeverArmM = Math.max(0.035, Math.max(avatarHandGripSize.x, avatarHandGripSize.y) * forgeMetersPerSceneUnit * 0.5);

const scene = new THREE.Scene();
const normalSkyColor = new THREE.Color(0x8fc8e8);
scene.background = normalSkyColor;
scene.fog = new THREE.Fog(0x8fc8e8, 52, 180);

const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 520);
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
forgeAvatar.position.set(-6.3, forgeGroundY, -4.3);
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

scene.add(new THREE.HemisphereLight(0xeef8ff, 0x6d7b45, 2.6));
const sun = new THREE.DirectionalLight(0xfff4c2, 2.1);
sun.position.set(-26, 42, 18);
sun.castShadow = false;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);

const worldTerrainRoot = new THREE.Group();
worldTerrainRoot.name = "forge-world-terrain";
scene.add(worldTerrainRoot);
const worldCloudRoot = new THREE.Group();
worldCloudRoot.name = "forge-world-clouds";
scene.add(worldCloudRoot);
const worldCubeGeometry = new THREE.BoxGeometry(1, 1, 1);
const worldWaterGeometry = new THREE.PlaneGeometry(1, 1);
worldWaterGeometry.rotateX(-Math.PI / 2);
const worldCloudGeometry = new THREE.SphereGeometry(1, 18, 12);
const worldGeometryByType = createWorldGeometryByType({
  THREE,
  cubeGeometry: worldCubeGeometry,
  waterGeometry: worldWaterGeometry,
  cloudGeometry: worldCloudGeometry,
});
const worldMaterials = createWorldMaterials({ THREE, includeCloud: true });
const sharedWorldGeometries = new Set(Object.values(worldGeometryByType));
const sharedWorldMaterials = new Set(Object.values(worldMaterials));
let currentForgeWorldLocation = null;
let forgeWorldState = null;
let forgeTerrainLocalBounds = null;
const avatarMoveKeys = new Set();
const avatarMovement = {
  velocityY: 0,
  grounded: true,
  movingHorizontal: false,
  direction: new THREE.Vector3(),
};
const avatarWalkSpeed = 4.2;
const avatarJumpSpeed = 5.4;
const avatarGravity = 14.5;
const avatarMaxStepHeight = 1.05;
const avatarTerrainMargin = 1.2;
const avatarCollisionHalfSize = new THREE.Vector2(0.46, 0.42);
const forgeBenchCollisionBox = {
  minX: -2.12,
  maxX: 2.12,
  minZ: -2.12,
  maxZ: 2.12,
};

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
let selectedBackpackMaterialEntryKey = "";
let activePanelTab = "materials";
const usedBackpackMaterialEntryKeys = new Set();
let moveEnabled = true;
let sawEnabled = false;
let drillEnabled = false;
let gripEnabled = false;
let paintEnabled = false;
let paintPointerId = null;
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
let forgeOnChainSubmitting = false;
const toolSettings = {
  saw: { angle: 0, mode: "kerf", side: "auto", depth: "through" },
  drill: { size: 3, profile: "round", depth: "through", direction: "a" },
  paint: { size: 1, color: "#f0c86a", mode: "paint" },
};
const toolSettingsMenu = createToolSettingsMenu();
const draftContextMenu = createDraftContextMenu();
renderDraftContextMenu();

const forgeRoot = new THREE.Group();
forgeRoot.position.y = forgeWorldYOffset;
scene.add(forgeRoot);

const forgeFireBlocks = [];
const forgeFireLight = new THREE.PointLight(0xff8c00, 2.4, 9);
forgeFireLight.position.set(0, 0.96, 1.02);
forgeRoot.add(forgeFireLight);

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

initializeForgeWorld();

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
renderPanelTabs();
renderBackpackMaterials();
void syncBackpackMaterials();
setStatus("forging.status.glovesReady");
animate();

window.addEventListener("resize", resize);
window.addEventListener("blur", () => {
  finishShapeToolAction();
  avatarMoveKeys.clear();
  avatarMovement.movingHorizontal = false;
});
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
  renderSelectedMaterialDetail();
  updateForgeLocationHud();
  updateAxisLabels();
  renderToolSettingsMenu();
  if (statusText.dataset.statusKey) statusText.textContent = t(statusText.dataset.statusKey);
  if (chainActionStatus?.dataset.statusKey) chainActionStatus.textContent = t(chainActionStatus.dataset.statusKey);
});

resetCameraButton.addEventListener("click", resetCamera);
randomForgeLocationButton?.addEventListener("click", () => {
  setForgeWorldLocation(randomForgeWorldLocation(), { persist: true, statusKey: "forging.status.locationChanged" });
});
panelTabButtons.forEach((button) => {
  button.addEventListener("click", () => selectPanelTab(button.dataset.forgingPanelTab));
});
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
  if (!prepareCurrentChainCodeFromDialog()) return;
  saveForgedItem(currentChainCode);
  setStatus("forging.status.chainSaved");
});
forgeOnChainButton?.addEventListener("click", () => {
  void forgeCurrentChainCodeOnChain();
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
  if (chainModal.classList.contains("open")) return;
  if (handleAvatarMovementKey(event, true)) return;
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
window.addEventListener("keyup", (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
  handleAvatarMovementKey(event, false);
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

  if (paintEnabled) {
    if (paintFromPointer()) {
      event.preventDefault();
      paintPointerId = event.pointerId;
      return;
    }
    if (touch) {
      rotatingCamera = true;
      cameraPointerId = event.pointerId;
      return;
    }
  }

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

  if (paintEnabled && leftPointerDown && paintPointerId === event.pointerId) {
    if (Math.hypot(dx, dy) > 2) leftPointerMoved = true;
    paintFromPointer();
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    return;
  }

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
  paintPointerId = null;
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
  if (paintPointerId === event.pointerId) paintPointerId = null;
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
    showToolSettingsMenu(event.clientX, event.clientY);
    updateHoveredFace();
  } else if (drillEnabled) {
    hideForgeContextMenu();
    showToolSettingsMenu(event.clientX, event.clientY);
    updateHoveredFace();
  } else if (paintEnabled) {
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

function handleAvatarMovementKey(event, down) {
  const code = event.code;
  if (!isAvatarMovementKey(code)) return false;
  event.preventDefault();
  if (code === "Space") {
    if (down && !event.repeat) jumpForgeAvatar();
    return true;
  }
  if (down) avatarMoveKeys.add(code);
  else avatarMoveKeys.delete(code);
  return true;
}

function isAvatarMovementKey(code) {
  return code === "KeyW" ||
    code === "KeyA" ||
    code === "KeyS" ||
    code === "KeyD" ||
    code === "ArrowUp" ||
    code === "ArrowLeft" ||
    code === "ArrowDown" ||
    code === "ArrowRight" ||
    code === "Space";
}

function jumpForgeAvatar() {
  if (!avatarMovement.grounded) return;
  avatarMovement.velocityY = avatarJumpSpeed;
  avatarMovement.grounded = false;
}

function updateForgeAvatarMovement(dt) {
  const stepDt = Math.min(dt, 1 / 30);
  const direction = avatarMoveDirectionFromKeys();
  avatarMovement.movingHorizontal = direction.lengthSq() > 0.0001;
  if (avatarMovement.movingHorizontal) {
    direction.normalize();
    avatarMovement.direction.copy(direction);
    moveForgeAvatarHorizontally(direction.multiplyScalar(avatarWalkSpeed * stepDt));
  }

  const groundY = forgeTerrainSurfaceYAt(forgeAvatar.position.x, forgeAvatar.position.z);
  if (avatarMovement.grounded) {
    forgeAvatar.position.y = groundY;
    return;
  }

  avatarMovement.velocityY -= avatarGravity * stepDt;
  forgeAvatar.position.y += avatarMovement.velocityY * stepDt;
  if (forgeAvatar.position.y <= groundY) {
    forgeAvatar.position.y = groundY;
    avatarMovement.velocityY = 0;
    avatarMovement.grounded = true;
  }
}

function avatarMoveDirectionFromKeys() {
  const forwardAmount = (avatarMoveKeys.has("KeyW") || avatarMoveKeys.has("ArrowUp") ? 1 : 0) -
    (avatarMoveKeys.has("KeyS") || avatarMoveKeys.has("ArrowDown") ? 1 : 0);
  const rightAmount = (avatarMoveKeys.has("KeyD") || avatarMoveKeys.has("ArrowRight") ? 1 : 0) -
    (avatarMoveKeys.has("KeyA") || avatarMoveKeys.has("ArrowLeft") ? 1 : 0);
  if (!forwardAmount && !rightAmount) return new THREE.Vector3();

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() <= 0.0001) forward.set(0, 0, -1);
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  return forward.multiplyScalar(forwardAmount).add(right.multiplyScalar(rightAmount));
}

function moveForgeAvatarHorizontally(delta) {
  if (delta.lengthSq() <= 0.000001) return;
  tryMoveForgeAvatarAxis("x", delta.x);
  tryMoveForgeAvatarAxis("z", delta.z);
}

function tryMoveForgeAvatarAxis(axis, delta) {
  if (Math.abs(delta) <= 0.000001) return false;
  const nextX = axis === "x" ? forgeAvatar.position.x + delta : forgeAvatar.position.x;
  const nextZ = axis === "z" ? forgeAvatar.position.z + delta : forgeAvatar.position.z;
  if (!canForgeAvatarMoveTo(nextX, nextZ)) return false;
  forgeAvatar.position.x = nextX;
  forgeAvatar.position.z = nextZ;
  return true;
}

function canForgeAvatarMoveTo(localX, localZ) {
  if (!pointWithinForgeTerrainBounds(localX, localZ)) return false;
  if (avatarOverlapsForgeBench(localX, localZ)) return false;
  const currentGroundY = forgeTerrainSurfaceYAt(forgeAvatar.position.x, forgeAvatar.position.z);
  const nextGroundY = forgeTerrainSurfaceYAt(localX, localZ);
  if (avatarMovement.grounded && nextGroundY > currentGroundY + avatarMaxStepHeight) return false;
  if (!avatarMovement.grounded && nextGroundY > forgeAvatar.position.y + avatarMaxStepHeight) return false;
  return true;
}

function pointWithinForgeTerrainBounds(localX, localZ) {
  if (!forgeTerrainLocalBounds) return true;
  return localX >= forgeTerrainLocalBounds.minX &&
    localX <= forgeTerrainLocalBounds.maxX &&
    localZ >= forgeTerrainLocalBounds.minZ &&
    localZ <= forgeTerrainLocalBounds.maxZ;
}

function avatarOverlapsForgeBench(localX, localZ) {
  return localX - avatarCollisionHalfSize.x < forgeBenchCollisionBox.maxX &&
    localX + avatarCollisionHalfSize.x > forgeBenchCollisionBox.minX &&
    localZ - avatarCollisionHalfSize.y < forgeBenchCollisionBox.maxZ &&
    localZ + avatarCollisionHalfSize.y > forgeBenchCollisionBox.minZ;
}

function forgeTerrainSurfaceYAt(localX, localZ) {
  const samples = [
    [localX, localZ],
    [localX - avatarCollisionHalfSize.x, localZ - avatarCollisionHalfSize.y],
    [localX - avatarCollisionHalfSize.x, localZ + avatarCollisionHalfSize.y],
    [localX + avatarCollisionHalfSize.x, localZ - avatarCollisionHalfSize.y],
    [localX + avatarCollisionHalfSize.x, localZ + avatarCollisionHalfSize.y],
  ];
  let groundY = -Infinity;
  for (const [sampleX, sampleZ] of samples) groundY = Math.max(groundY, forgeColumnSurfaceYAt(sampleX, sampleZ));
  return Number.isFinite(groundY) ? groundY : forgeGroundY;
}

function forgeColumnSurfaceYAt(localX, localZ) {
  if (!currentForgeWorldLocation) return forgeGroundY;
  const worldX = Math.round(currentForgeWorldLocation.x + localX);
  const worldZ = Math.round(currentForgeWorldLocation.z + localZ);
  const surfaceY = canonicalSurfaceHeightAt({ x: worldX, z: worldZ });
  const waterY = canonicalWaterLevelAt({ x: worldX, z: worldZ, surface: surfaceY });
  const topY = waterY !== null && waterY !== undefined && waterY > surfaceY ? waterY : surfaceY;
  return forgeWorldBlockTopToLocalY(topY, currentForgeWorldLocation);
}

function forgeTerrainOffsetY(location) {
  return forgeGroundY - (location.surfaceY + forgeTerrainBlockTopOffset);
}

function forgeWorldBlockTopToLocalY(blockY, location) {
  return blockY + forgeTerrainBlockTopOffset + forgeTerrainOffsetY(location);
}

function toolCursorUrl(toolId) {
  const svg = toolCursorSvg(toolId);
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function toolCursorSvg(toolId) {
  return toolIconSvg(toolId, 32);
}

function toolIconSvg(toolId, size = 24) {
  const common = "stroke='#10140f' stroke-width='2' stroke-linejoin='round' stroke-linecap='round'";
  const fine = "stroke='#10140f' stroke-width='1.35' stroke-linejoin='round' stroke-linecap='round'";
  if (toolId === "hammer") {
    return `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 32 32' focusable='false'><g transform='rotate(-32 16 16)'><path ${common} fill='#8f9795' d='M6 6h19v7H6z'/><path ${common} fill='#6b3f25' d='M15 12h5v18h-5z'/><path ${fine} fill='#d6ddd8' d='M4 7h4v5H4zM24 7h4v5h-4z'/><path fill='rgba(255,255,255,0.28)' d='M9 7h13v2H9z'/></g></svg>`;
  }
  if (toolId === "saw") {
    return `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 32 32' focusable='false'><path ${common} fill='#c8d0c9' d='M7 9h21l-5 8H8z'/><path fill='#10140f' d='M9 17l2.2 4 2.1-4 2.2 4 2.1-4 2.2 4 2.1-4z'/><path ${common} fill='#6b3f25' d='M4 13h7l-1 10H4z'/><path ${fine} fill='none' d='M6.5 16.5h2.4'/><path fill='rgba(255,255,255,0.25)' d='M10 10h15l-1.2 2H10z'/></svg>`;
  }
  if (toolId === "handDrill") {
    return `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 32 32' focusable='false'><path ${common} fill='#b8c0bd' d='M7 13h14l4 3-4 3H7z'/><path ${common} fill='#d6ddd8' d='M24 14.2l5 1.8-5 1.8z'/><path ${common} fill='#6b3f25' d='M7 18h6v10H8z'/><path ${common} fill='none' d='M12 13V7h8'/><circle ${fine} cx='22.5' cy='7' r='2.6' fill='#c99061'/><path fill='rgba(255,255,255,0.22)' d='M10 14h9l1.4 2H10z'/></svg>`;
  }
  if (toolId === "grip") {
    return `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 32 32' focusable='false'><path ${common} fill='#6b3f25' d='M18 4h5v24h-5z'/><path ${common} fill='#c99061' d='M8 8h11v4H8zM6 12h13v4H6zM7 16h12v4H7zM9 20h10v4H9z'/><path ${common} fill='#b2774f' d='M6 18l5-5 4 4-5 6z'/><path fill='rgba(255,255,255,0.22)' d='M9 9h8v1.4H9zM8 13h9v1.4H8z'/></svg>`;
  }
  if (toolId === "axe") {
    return `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 32 32' focusable='false'><path ${common} fill='#6b3f25' d='M15 8h5v21h-5z'/><path ${common} fill='#9ea6a8' d='M12 5h9c4.2 0 7 3.1 7 7s-2.8 7-7 7h-9c2.3-4.2 2.3-9.8 0-14z'/><path ${fine} fill='#d6ddd8' d='M18 7h4.4c1.7.5 3.1 2.3 3.1 4.8s-1.4 4.4-3.1 5H18c1.1-3 1.1-6.8 0-9.8z'/><path fill='rgba(255,255,255,0.24)' d='M18 8h4c.8.3 1.4.9 1.9 1.7H18.5z'/></svg>`;
  }
  if (toolId === "paintBrush") {
    return `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 32 32' focusable='false'><g transform='rotate(-45 16 16)'><path ${common} fill='#6b3f25' d='M14 5h5v15h-5z'/><path ${common} fill='#d8d0bd' d='M13 18h7v4h-7z'/><path ${common} fill='#f0cf4f' d='M12 21h9l-2 6h-5z'/><path fill='#4bd6c8' d='M14 26h5l-2.5 4z'/><path fill='rgba(255,255,255,0.24)' d='M15 6h1.3v11H15z'/></g><path ${fine} fill='#4bd6c8' d='M5 24c0-1.6 1.7-3.2 1.7-3.2S8.4 22.4 8.4 24a1.7 1.7 0 0 1-3.4 0z'/></svg>`;
  }
  if (toolId === "gloves") {
    return `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 32 32' focusable='false'><path ${common} fill='#8a5a35' d='M6 14c0-1.2.9-2.2 2.1-2.2H9V7.4C9 6.6 9.6 6 10.4 6s1.3.6 1.3 1.4v4.4h.8V5.8c0-.8.6-1.4 1.4-1.4s1.3.6 1.3 1.4v6h.8V7.1c0-.8.6-1.4 1.3-1.4s1.3.6 1.3 1.4v6l1-1.1c.6-.6 1.5-.7 2.1-.1s.6 1.4 0 2.1l-3.4 3.9v5.3H8.7V19l-2-2.5c-.5-.6-.7-1.4-.7-2.5z'/><path ${common} fill='#6f4529' d='M8.3 22.2h10.4v4.6H8.3z'/><path ${fine} fill='none' d='M9.2 11.9v4.8M12 11.9v4.3M14.9 11.9v3.9'/><path fill='rgba(255,255,255,0.18)' d='M10 7.4c0-.2.2-.4.4-.4s.3.2.3.4v3.7H10zM13.3 5.8c0-.2.2-.4.4-.4s.4.2.4.4v5.3h-.8z'/></svg>`;
  }
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 32 32' focusable='false'><path fill='none' stroke='rgba(255,248,220,0.52)' stroke-width='2' stroke-linejoin='round' stroke-linecap='round' stroke-dasharray='3 3' d='M9 9h14v14H9z'/><path fill='none' stroke='rgba(255,248,220,0.38)' stroke-width='1.35' stroke-linejoin='round' stroke-linecap='round' d='M12 16h8'/></svg>`;
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

function initializeForgeWorld() {
  const stored = readStoredForgeWorldLocation();
  let initialLocation = null;
  let shouldPersist = false;
  if (stored) {
    const sampled = sampleForgeSite(stored.x, stored.z);
    if (sampled.valid) initialLocation = sampled;
    else shouldPersist = true;
  } else {
    shouldPersist = true;
  }
  if (!initialLocation) initialLocation = findForgeWorldLocationNear(stored?.x ?? 0, stored?.z ?? 0);
  setForgeWorldLocation(initialLocation, { persist: shouldPersist, statusKey: "" });
}

function setForgeWorldLocation(location, { persist = true, statusKey = "" } = {}) {
  const nextLocation = normalizeForgeWorldLocation(location);
  currentForgeWorldLocation = nextLocation;
  if (persist) writeForgeWorldLocation(nextLocation);
  renderForgeWorldTerrain(nextLocation);
  updateForgeLocationHud();
  if (statusKey) setStatus(statusKey);
}

function normalizeForgeWorldLocation(location) {
  if (location?.valid && Number.isFinite(location.surfaceY)) return location;
  const x = Math.round(Number(location?.x) || 0);
  const z = Math.round(Number(location?.z) || 0);
  const sampled = sampleForgeSite(x, z);
  if (sampled.valid) return sampled;
  return findForgeWorldLocationNear(x, z);
}

function readStoredForgeWorldLocation() {
  try {
    const parsed = JSON.parse(localStorage.getItem(forgeWorldLocationStorageKey) || "null");
    const x = Math.round(Number(parsed?.x));
    const z = Math.round(Number(parsed?.z));
    return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
  } catch {
    return null;
  }
}

function writeForgeWorldLocation(location) {
  try {
    localStorage.setItem(forgeWorldLocationStorageKey, JSON.stringify({ x: location.x, z: location.z }));
  } catch {
    // The forge can still render if browser storage is unavailable.
  }
}

function randomForgeWorldLocation() {
  let best = null;
  for (let attempt = 0; attempt < 90; attempt++) {
    const x = Math.round((Math.random() * 2 - 1) * forgeLocationRandomRange);
    const z = Math.round((Math.random() * 2 - 1) * forgeLocationRandomRange);
    const candidate = findForgeWorldLocationNear(x, z, 32);
    if (candidate.valid) return candidate;
    if (!best || candidate.score > best.score) best = candidate;
  }
  return best ?? findForgeWorldLocationNear(0, 0);
}

function findForgeWorldLocationNear(originX, originZ, maxRadius = forgeLocationSearchRadius) {
  const ox = Math.round(Number(originX) || 0);
  const oz = Math.round(Number(originZ) || 0);
  let best = sampleForgeSite(ox, oz);
  if (best.valid) return best;

  for (let radius = 4; radius <= maxRadius; radius += 4) {
    for (let dz = -radius; dz <= radius; dz += 4) {
      for (let dx = -radius; dx <= radius; dx += 4) {
        if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
        const candidate = sampleForgeSite(ox + dx, oz + dz);
        if (!best || candidate.score > best.score) best = candidate;
        if (candidate.valid) return candidate;
      }
    }
  }

  return best;
}

function sampleForgeSite(x, z) {
  const centerX = Math.round(Number(x) || 0);
  const centerZ = Math.round(Number(z) || 0);
  const centerSurfaceY = canonicalSurfaceHeightAt({ x: centerX, z: centerZ });
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  let maxSlope = 0;
  let dry = true;

  for (const [dx, dz] of forgeSiteOffsets) {
    const sampleX = centerX + dx;
    const sampleZ = centerZ + dz;
    const surfaceY = canonicalSurfaceHeightAt({ x: sampleX, z: sampleZ });
    const waterY = canonicalWaterLevelAt({ x: sampleX, z: sampleZ, surface: surfaceY });
    minHeight = Math.min(minHeight, surfaceY);
    maxHeight = Math.max(maxHeight, surfaceY);
    maxSlope = Math.max(maxSlope, canonicalColumnSlope(sampleX, sampleZ, surfaceY));
    if (isUnsuitableForgeSample(surfaceY, waterY)) dry = false;
  }

  const heightDelta = maxHeight - minHeight;
  const valid = dry && heightDelta <= forgeSiteMaxHeightDelta && maxSlope <= forgeSiteMaxSlope;
  const score =
    (dry ? 1000 : 0) -
    heightDelta * 36 -
    maxSlope * 14 -
    Math.max(0, seaLevel + 2 - centerSurfaceY) * 24;

  return {
    x: centerX,
    z: centerZ,
    surfaceY: centerSurfaceY,
    minHeight,
    maxHeight,
    heightDelta,
    maxSlope,
    dry,
    valid,
    score,
  };
}

function canonicalColumnSlope(x, z, centerSurfaceY = canonicalSurfaceHeightAt({ x, z })) {
  return Math.max(
    Math.abs(centerSurfaceY - canonicalSurfaceHeightAt({ x: x + 1, z })),
    Math.abs(centerSurfaceY - canonicalSurfaceHeightAt({ x: x - 1, z })),
    Math.abs(centerSurfaceY - canonicalSurfaceHeightAt({ x, z: z + 1 })),
    Math.abs(centerSurfaceY - canonicalSurfaceHeightAt({ x, z: z - 1 })),
  );
}

function isUnsuitableForgeSample(surfaceY, waterY) {
  return surfaceY <= seaLevel + 1 || waterY !== null && waterY !== undefined && waterY > surfaceY;
}

function renderForgeWorldTerrain(location) {
  clearWorldGroup(worldTerrainRoot);
  clearWorldGroup(worldCloudRoot);
  forgeWorldState = createWorldState();

  const terrainOffsetY = forgeTerrainOffsetY(location);
  worldTerrainRoot.position.set(-location.x, terrainOffsetY, -location.z);
  worldCloudRoot.position.set(-location.x, terrainOffsetY, -location.z);

  const centerChunkX = Math.floor(location.x / chunkSize);
  const centerChunkZ = Math.floor(location.z / chunkSize);
  forgeTerrainLocalBounds = {
    minX: (centerChunkX - forgeTerrainChunkRadius) * chunkSize - location.x + avatarTerrainMargin,
    maxX: (centerChunkX + forgeTerrainChunkRadius + 1) * chunkSize - location.x - avatarTerrainMargin,
    minZ: (centerChunkZ - forgeTerrainChunkRadius) * chunkSize - location.z + avatarTerrainMargin,
    maxZ: (centerChunkZ + forgeTerrainChunkRadius + 1) * chunkSize - location.z - avatarTerrainMargin,
  };
  for (let dz = -forgeTerrainChunkRadius; dz <= forgeTerrainChunkRadius; dz += 1) {
    for (let dx = -forgeTerrainChunkRadius; dx <= forgeTerrainChunkRadius; dx += 1) {
      const detailMode = Math.max(Math.abs(dx), Math.abs(dz)) <= forgeTerrainDecoratedRadius ? "decorated" : "surface";
      worldTerrainRoot.add(createChunkGroup({
        THREE,
        chunkX: centerChunkX + dx,
        chunkZ: centerChunkZ + dz,
        state: forgeWorldState,
        geometryByType: worldGeometryByType,
        materials: worldMaterials,
        detailMode,
      }));
    }
  }

  const centerSectorX = Math.floor(location.x / cloudSectorSize);
  const centerSectorZ = Math.floor(location.z / cloudSectorSize);
  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const cloudGroup = createCloudSectorGroup({
        THREE,
        sectorX: centerSectorX + dx,
        sectorZ: centerSectorZ + dz,
        geometry: worldGeometryByType.cloud,
        material: worldMaterials.cloud,
      });
      if (cloudGroup) worldCloudRoot.add(cloudGroup);
    }
  }

  positionForgeAvatarOnTerrain(location);
}

function clearWorldGroup(group) {
  group.traverse((object) => {
    if (!object.isMesh) return;
    if (object.geometry && !sharedWorldGeometries.has(object.geometry)) object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material && !sharedWorldMaterials.has(material)) material.dispose?.();
    }
  });
  group.clear();
}

function positionForgeAvatarOnTerrain(location) {
  clampForgeAvatarToTerrainBounds();
  forgeAvatar.position.y = forgeTerrainSurfaceYAt(forgeAvatar.position.x, forgeAvatar.position.z);
  avatarMovement.velocityY = 0;
  avatarMovement.grounded = true;
  faceForgeAvatarToBench();
}

function clampForgeAvatarToTerrainBounds() {
  if (forgeTerrainLocalBounds) {
    forgeAvatar.position.x = THREE.MathUtils.clamp(forgeAvatar.position.x, forgeTerrainLocalBounds.minX, forgeTerrainLocalBounds.maxX);
    forgeAvatar.position.z = THREE.MathUtils.clamp(forgeAvatar.position.z, forgeTerrainLocalBounds.minZ, forgeTerrainLocalBounds.maxZ);
  }
  if (!avatarOverlapsForgeBench(forgeAvatar.position.x, forgeAvatar.position.z)) return;
  forgeAvatar.position.set(-6.3, forgeAvatar.position.y, -4.3);
  if (!forgeTerrainLocalBounds) return;
  forgeAvatar.position.x = THREE.MathUtils.clamp(forgeAvatar.position.x, forgeTerrainLocalBounds.minX, forgeTerrainLocalBounds.maxX);
  forgeAvatar.position.z = THREE.MathUtils.clamp(forgeAvatar.position.z, forgeTerrainLocalBounds.minZ, forgeTerrainLocalBounds.maxZ);
}

function updateForgeLocationHud() {
  if (!forgeLocationText) return;
  if (!currentForgeWorldLocation) {
    forgeLocationText.textContent = t("forging.locationLoading");
    return;
  }
  forgeLocationText.textContent = t("forging.locationValue", {
    x: currentForgeWorldLocation.x,
    z: currentForgeWorldLocation.z,
  });
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

function selectPanelTab(tabId) {
  if (!panelTabPanels[tabId]) return;
  activePanelTab = tabId;
  renderPanelTabs();
}

function renderPanelTabs() {
  panelTabButtons.forEach((button) => {
    const active = button.dataset.forgingPanelTab === activePanelTab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  for (const [tabId, panel] of Object.entries(panelTabPanels)) {
    if (!panel) continue;
    const active = tabId === activePanelTab;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  }
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
    renderSelectedMaterialDetail();
    return;
  }
  if (backpackMaterialStatus === "no-backpack") {
    resourceGrid.replaceChildren(createMaterialStateCard("empty", "forging.materialNoBackpack", "forging.materialNoBackpackDetail"));
    renderSelectedMaterialDetail();
    return;
  }
  if (backpackMaterialStatus === "error") {
    resourceGrid.replaceChildren(createMaterialStateCard("error", "forging.materialLoadFailed", "forging.materialLoadFailedDetail"));
    renderSelectedMaterialDetail();
    return;
  }
  if (!backpackMaterialEntries.length) {
    resourceGrid.replaceChildren(createMaterialStateCard("empty", "forging.materialEmpty", "forging.materialEmptyDetail"));
    renderSelectedMaterialDetail();
    return;
  }
  ensureSelectedBackpackMaterialEntry();
  resourceGrid.replaceChildren(...backpackMaterialEntries.map(createMaterialCard));
  renderSelectedMaterialDetail();
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
  const used = usedBackpackMaterialEntryKeys.has(entry.key);
  const card = document.createElement("button");
  card.className = "resource-card material-slot";
  card.type = "button";
  card.draggable = !used;
  card.classList.toggle("used", used);
  card.classList.toggle("selected", entry.key === selectedBackpackMaterialEntryKey);
  card.dataset.material = entry.id;
  card.dataset.materialEntry = entry.key;
  card.setAttribute("aria-disabled", String(used));
  card.setAttribute("aria-pressed", String(entry.key === selectedBackpackMaterialEntryKey));
  card.title = materialDisplayName(entry.id);

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

  const count = document.createElement("span");
  count.className = "material-slot-count";
  count.textContent = `x${entry.quantity}`;

  card.append(swatch, title, detail, count);
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
  card.addEventListener("click", () => selectBackpackMaterialEntry(entry.key));
  card.addEventListener("dblclick", () => addBackpackMaterialEntry(entry));
  return card;
}

function ensureSelectedBackpackMaterialEntry() {
  if (selectedBackpackMaterialEntryKey && backpackMaterialEntryByKey(selectedBackpackMaterialEntryKey)) return;
  selectedBackpackMaterialEntryKey = backpackMaterialEntries[0]?.key ?? "";
}

function selectBackpackMaterialEntry(key) {
  selectedBackpackMaterialEntryKey = key || "";
  resourceGrid?.querySelectorAll(".material-slot").forEach((card) => {
    const selected = card.dataset.materialEntry === selectedBackpackMaterialEntryKey;
    card.classList.toggle("selected", selected);
    card.setAttribute("aria-pressed", String(selected));
  });
  renderSelectedMaterialDetail();
}

function renderSelectedMaterialDetail() {
  if (!materialDetailPanel) return;
  const entry = backpackMaterialEntryByKey(selectedBackpackMaterialEntryKey);
  if (!entry) {
    if (backpackMaterialStatus !== "ready") {
      materialDetailPanel.hidden = true;
      materialDetailPanel.replaceChildren();
      return;
    }
    materialDetailPanel.hidden = false;
    materialDetailPanel.replaceChildren(createDetailEmptyState("forging.selectMaterialPrompt", "forging.selectMaterialPromptDetail"));
    return;
  }

  materialDetailPanel.hidden = false;
  const profile = materialForgeProfile(entry.id, entry);
  const fuel = smeltingFuelForMaterialId(entry.id);
  const attributes = smeltingMaterialBaseAttributes(entry.material);
  const header = document.createElement("div");
  header.className = "material-detail-head";
  const swatch = document.createElement("span");
  swatch.className = "resource-swatch resource-preview-swatch";
  swatch.setAttribute("aria-hidden", "true");
  swatch.append(createResourceMaterialPreviewCanvas(entry.material, {
    className: "resource-swatch-canvas",
    size: 56,
  }));
  const titleWrap = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = materialDisplayName(entry.id);
  const subtitle = document.createElement("span");
  subtitle.textContent = fuel
    ? t("forging.materialFuelDetail", { tier: fuel.heatTier, count: entry.quantity })
    : t("forging.materialCardDetail", { type: materialUseLabel(entry.material), count: entry.quantity });
  titleWrap.append(title, subtitle);
  header.append(swatch, titleWrap);

  const rows = document.createElement("div");
  rows.className = "detail-stat-grid";
  for (const [label, value] of materialDetailRows(entry, profile, attributes)) {
    rows.append(createDetailStat(label, value));
  }

  const composition = document.createElement("div");
  composition.className = "detail-composition";
  const compositionTitle = document.createElement("span");
  compositionTitle.textContent = t("forging.materialComposition");
  const compositionValue = document.createElement("b");
  compositionValue.textContent = formatComposition(entry.material.composition);
  composition.append(compositionTitle, compositionValue);

  const action = document.createElement("button");
  action.type = "button";
  action.className = "material-add-button";
  action.disabled = usedBackpackMaterialEntryKeys.has(entry.key);
  action.textContent = usedBackpackMaterialEntryKeys.has(entry.key)
    ? t("forging.materialUsed")
    : t("forging.addMaterial");
  action.addEventListener("click", () => addBackpackMaterialEntry(entry));

  materialDetailPanel.replaceChildren(header, rows, composition, action);
}

function createDetailEmptyState(titleKey, detailKey) {
  const state = document.createElement("div");
  state.className = "detail-empty-state";
  const title = document.createElement("strong");
  title.textContent = t(titleKey);
  const detail = document.createElement("span");
  detail.textContent = t(detailKey);
  state.append(title, detail);
  return state;
}

function materialDetailRows(entry, profile, attributes) {
  return [
    [t("forging.materialType"), materialUseLabel(entry.material)],
    [t("forging.materialMass"), formatMassKg(profile.mass)],
    [t("forging.materialVolume"), formatVolumeLiters(volumeMm3ToM3(entry.volumeMm3 || defaultResourceVolumeMm3))],
    [t("forging.materialDensity"), formatDensityKgM3(profile.densityKgM3)],
    [t("forging.materialDimensions"), formatDimensionsFromSceneUnits(profile.dims)],
    [t("forging.materialHardness"), formatScore(attributes.hardness)],
    [t("forging.materialHeat"), t("forging.percent", { value: Math.round(profile.heat) })],
    [t("forging.materialSlot"), `#${entry.slotIndex + 1}`],
  ];
}

function createDetailStat(label, value) {
  const row = document.createElement("div");
  const key = document.createElement("span");
  key.textContent = label;
  const data = document.createElement("b");
  data.textContent = value;
  row.append(key, data);
  return row;
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

function formatForceN(value) {
  const force = Number(value) || 0;
  if (force < 100) return `${force.toFixed(1)} N`;
  return `${Math.round(force).toLocaleString()} N`;
}

function formatTorqueNm(value) {
  const torque = Number(value) || 0;
  if (torque < 1) return `${torque.toFixed(3)} N*m`;
  if (torque < 10) return `${torque.toFixed(2)} N*m`;
  return `${torque.toFixed(1)} N*m`;
}

function formatKgf(value) {
  const kgf = (Number(value) || 0) / gravityMs2;
  if (kgf < 1) return `${kgf.toFixed(2)} kgf`;
  if (kgf < 10) return `${kgf.toFixed(1)} kgf`;
  return `${Math.round(kgf)} kgf`;
}

function formatGripStrengthRequirement(strength) {
  if (!strength?.hasGrip) return t("forging.gripNotSet");
  return t("forging.gripRequirementValue", {
    force: formatForceN(strength.requiredForceN),
    kgf: formatKgf(strength.requiredForceN),
  });
}

function formatVectorMeters(vector) {
  if (!vector) return "-";
  return t("forging.vectorValue", {
    x: formatLengthM(vector.x * forgeMetersPerSceneUnit),
    y: formatLengthM(vector.y * forgeMetersPerSceneUnit),
    z: formatLengthM(vector.z * forgeMetersPerSceneUnit),
  });
}

function formatLengthM(value) {
  const meters = Math.abs(Number(value) || 0);
  const sign = Number(value) < 0 ? "-" : "";
  if (meters > 0 && meters < 0.01) return `${sign}${(meters * 1000).toFixed(1)} mm`;
  if (meters < 1) return `${sign}${(meters * 100).toFixed(1)} cm`;
  return `${sign}${meters.toFixed(2)} m`;
}

function formatDimensionsFromSceneUnits(dims = []) {
  const values = Array.isArray(dims)
    ? dims
    : [dims.x, dims.y, dims.z];
  return t("forging.dimensionsValue", {
    x: formatLengthM((Number(values[0]) || 0) * forgeMetersPerSceneUnit),
    y: formatLengthM((Number(values[1]) || 0) * forgeMetersPerSceneUnit),
    z: formatLengthM((Number(values[2]) || 0) * forgeMetersPerSceneUnit),
  });
}

function formatScore(value) {
  return t("forging.scoreValue", { value: Math.round(Number(value) || 0) });
}

function formatComposition(composition = []) {
  if (!Array.isArray(composition) || !composition.length) return "-";
  return composition
    .map(([symbol, range]) => `${symbol} ${range}`)
    .join(", ");
}

function volumeMm3ToM3(value) {
  return Math.max(0, Number(value) || 0) * 1e-9;
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
  const pieceColor = component.color?.clone?.() ?? new THREE.Color(component.color ?? resource.color);
  const material = workMaterial.clone();
  material.color.copy(pieceColor);
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
    color: pieceColor,
    heat: resource.heat,
    mass: 0,
    baseMass: 0,
    densityKgM3: component.densityKgM3 ?? materialDensityForIds(component.materialIds, resourceId),
    hardness: resource.hardness,
    dims: component.dims.clone(),
    offset: component.offset.clone(),
    grid: { ...component.grid },
    solid: new Uint8Array(component.solid),
    paint: clonePaintRecords(component.paint),
    gripOffset: component.gripOffset?.clone?.().sub(component.offset) ?? null,
    gripNormal: component.gripNormal?.clone?.() ?? null,
    gripAngle: component.gripAngle ?? 0,
    mesh,
    edges,
  };
  piece.baseMass = componentFullMassKg(piece);
  piece.mass = componentMassKg(piece);
  refreshPieceGeometry(piece);
  return piece;
}

function createPieceFromAppearance(appearance, equipmentStats = null) {
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
    equipmentStats: normalizeEquipmentStats(equipmentStats),
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
    piece.paint = deserializeDraftPaint(snapshot.paint, grid);
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
    paint: deserializeDraftPaint(component.paint, grid),
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

function deserializeDraftPaint(paint, grid = voxelGrid) {
  if (!Array.isArray(paint)) return [];
  return paint
    .map((record) => ({
      axis: THREE.MathUtils.clamp(Math.round(Number(record?.axis) || 0), 0, 2),
      side: Number(record?.side) ? 1 : 0,
      x: Math.round(Number(record?.x) || 0),
      y: Math.round(Number(record?.y) || 0),
      z: Math.round(Number(record?.z) || 0),
      color: validColorValue(record?.color) ? record.color : "#ffffff",
    }))
    .filter((record) => validPaintRecord(record, grid));
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
  prunePaintForPiece(piece);
  const geometry = piece.appearance ? buildAppearanceGeometry(piece.appearance) : piece.components ? buildCompoundGeometry(piece) : buildVoxelGeometry(piece);
  piece.mesh.geometry.dispose();
  piece.mesh.geometry = geometry;
  syncPieceMaterialVertexColors(piece, geometry);
  piece.edges.geometry.dispose();
  piece.edges.geometry = new THREE.EdgesGeometry(geometry, 28);
  updatePieceMass(piece);
  validateGripBindingAfterGeometryChange(piece);
}

function buildVoxelGeometry(piece) {
  const positions = [];
  const normals = [];
  const colors = componentHasPaint(piece) ? [] : null;
  const color = piece.color ?? new THREE.Color(resources[piece.resourceId]?.color ?? resources.iron.color);
  appendGreedyVoxelGeometry({
    grid: piece.grid,
    dims: piece.dims,
    solid: piece.solid,
    offset: new THREE.Vector3(),
    color,
    faceColor: componentHasPaint(piece) ? paintedFaceColor(piece, color) : null,
    positions,
    normals,
    colors,
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  if (colors) geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

function syncPieceMaterialVertexColors(piece, geometry) {
  const material = piece.mesh?.material;
  if (!material || Array.isArray(material)) return;
  const usesVertexColors = Boolean(geometry.getAttribute("color"));
  if (material.vertexColors !== usesVertexColors) {
    material.vertexColors = usesVertexColors;
    material.needsUpdate = true;
  }
  if (usesVertexColors) material.color?.set?.(0xffffff);
  else if (piece.color) material.color?.copy?.(piece.color);
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
  const color = component.color ?? new THREE.Color(resources[component.resourceId]?.color ?? 0xb46f42);
  if (componentIsFullySolidForGeometry(component) && !componentHasPaint(component)) {
    appendSolidCuboidGeometry({ dims, offset, color, positions, normals, colors });
    return;
  }
  appendGreedyVoxelGeometry({
    grid,
    dims,
    solid: component.solid,
    offset,
    color,
    faceColor: componentHasPaint(component) ? paintedFaceColor(component, color) : null,
    positions,
    normals,
    colors,
  });
}

function componentHasPaint(component) {
  return Array.isArray(component?.paint) && component.paint.length > 0;
}

function paintedFaceColor(component, fallbackColor) {
  const lookup = componentPaintLookup(component);
  return ({ axis, side, cell }) => lookup.get(paintFaceKey(axis, side, cell)) ?? fallbackColor;
}

function componentPaintLookup(component) {
  const lookup = new Map();
  for (const record of component?.paint ?? []) {
    if (!validPaintRecord(record, component.grid)) continue;
    lookup.set(paintFaceKey(record.axis, record.side, [record.x, record.y, record.z]), paintRecordColor(record));
  }
  return lookup;
}

function validPaintRecord(record, grid = voxelGrid) {
  return Number.isInteger(record?.axis) &&
    record.axis >= 0 &&
    record.axis <= 2 &&
    (record.side === 0 || record.side === 1) &&
    Number.isInteger(record.x) &&
    Number.isInteger(record.y) &&
    Number.isInteger(record.z) &&
    record.x >= 0 &&
    record.y >= 0 &&
    record.z >= 0 &&
    record.x < grid.x &&
    record.y < grid.y &&
    record.z < grid.z;
}

function paintRecordColor(record) {
  return record.color instanceof THREE.Color
    ? record.color
    : new THREE.Color(record.color ?? 0xffffff);
}

function prunePaintForPiece(piece) {
  if (piece?.components) {
    for (const component of piece.components) prunePaintForComponent(component);
    return;
  }
  prunePaintForComponent(piece);
}

function prunePaintForComponent(component) {
  if (!Array.isArray(component?.paint) || !component.paint.length) return;
  component.paint = component.paint.filter((record) => (
    validPaintRecord(record, component.grid) &&
    isExposedPaintCell(component, [record.x, record.y, record.z], record.axis, record.side) &&
    quantizedColorValue(record.color) !== quantizedColorValue(component.color ?? resources[component.resourceId]?.color ?? resources.iron.color)
  ));
}

function paintFaceKey(axis, side, cell) {
  return `${axis}:${side}:${cell[0]}:${cell[1]}:${cell[2]}`;
}

function componentIsFullySolidForGeometry(component) {
  const total = (component?.grid?.x ?? 0) * (component?.grid?.y ?? 0) * (component?.grid?.z ?? 0);
  if (!total || component?.solid?.length !== total) return false;
  for (const value of component.solid) if (value !== 1) return false;
  return true;
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
  localPoint = gripLocalPointForRegion(
    localPoint,
    normal,
    region,
    avatarHandGripFootprint.x,
    avatarHandGripFootprint.y,
  );
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
  localPoint = gripLocalPointForRegion(
    localPoint,
    normal,
    region,
    avatarHandGripFootprint.x,
    avatarHandGripFootprint.y,
  );
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
    snapshot.paint = clonePaintRecords(piece.paint);
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
  piece.paint = clonePaintRecords(snapshot.paint);
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
    paint: clonePaintRecords(component.paint),
    solidCells: component.solidCells?.map((cell) => [...cell]),
    gripOffset: component.gripOffset?.clone?.() ?? null,
    gripNormal: component.gripNormal?.clone?.() ?? null,
    gripAngle: component.gripAngle ?? 0,
  };
}

function clonePaintRecords(paint) {
  if (!Array.isArray(paint) || !paint.length) return [];
  return paint.map((record) => ({
    axis: record.axis,
    side: record.side,
    x: record.x,
    y: record.y,
    z: record.z,
    color: colorStringFromQuantized(quantizedColorValue(record.color)),
  }));
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
  piece.paint = rotatePaintRecords(piece.paint, oldGrid, axis);
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
  component.paint = rotatePaintRecords(component.paint, oldGrid, axis);
  if (axis === "x") component.dims.set(oldDims.x, oldDims.z, oldDims.y);
  if (axis === "y") component.dims.set(oldDims.z, oldDims.y, oldDims.x);
  if (axis === "z") component.dims.set(oldDims.y, oldDims.x, oldDims.z);
}

function rotatePaintRecords(paint, oldGrid, axis) {
  if (!Array.isArray(paint) || !paint.length) return [];
  return paint.map((record) => {
    const cell = rotatedCoordinate(record.x, record.y, record.z, oldGrid, axis);
    const normal = new THREE.Vector3();
    normal.setComponent(record.axis, record.side ? 1 : -1);
    const rotatedNormal = rotatedVector(normal, axis).normalize();
    const nextAxis = dominantAxis(rotatedNormal);
    return {
      axis: nextAxis,
      side: Math.sign(rotatedNormal.getComponent(nextAxis)) > 0 ? 1 : 0,
      x: cell[0],
      y: cell[1],
      z: cell[2],
      color: colorStringFromQuantized(quantizedColorValue(record.color)),
    };
  });
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
    paint: serializePaintRecords(piece.paint),
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
    paint: serializePaintRecords(component.paint),
    gripOffset: component.gripOffset ? vectorToArray(component.gripOffset) : null,
    gripNormal: component.gripNormal ? vectorToArray(component.gripNormal) : null,
    gripAngle: component.gripAngle ?? 0,
  };
}

function serializePaintRecords(paint) {
  if (!Array.isArray(paint) || !paint.length) return [];
  return paint.map((record) => ({
    axis: record.axis,
    side: record.side,
    x: record.x,
    y: record.y,
    z: record.z,
    color: colorStringFromQuantized(quantizedColorValue(record.color)),
  }));
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
    paint: clonePaintRecords(component.paint),
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
    paint: clonePaintRecords(piece.paint),
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
  setChainActionStatus(currentChainCode ? "forging.chainActionReady" : "forging.status.noChainCode", "neutral");
  chainModal.classList.add("open");
  chainModal.setAttribute("aria-hidden", "false");
  chainCodeOutput.focus();
  chainCodeOutput.select();
}

function ensureCurrentChainCode() {
  if (!pieces.length) return;
  try {
    currentChainCode = encodeForgeCode(forgeBlueprintFromPieces(pieces));
    chainCodeOutput.value = currentChainCode;
  } catch (error) {
    console.warn("Failed to encode forge code", error);
    currentChainCode = "";
    chainCodeOutput.value = "";
    setStatus("forging.status.chainCodeTooLarge");
    setChainActionStatus("forging.status.chainCodeTooLarge", "error");
  }
}

function prepareCurrentChainCodeFromDialog() {
  const inputCode = chainCodeOutput.value.trim();
  if (inputCode) {
    let blueprint;
    try {
      blueprint = decodeForgeCode(inputCode);
    } catch (_error) {
      setStatus("forging.status.invalidChainCode");
      setChainActionStatus("forging.status.invalidChainCode", "error");
      return false;
    }
    if (!blueprint.appearance && !blueprint.components?.length) {
      setStatus("forging.status.invalidChainCode");
      setChainActionStatus("forging.status.invalidChainCode", "error");
      return false;
    }
    currentChainCode = inputCode;
  } else {
    ensureCurrentChainCode();
  }
  if (!currentChainCode) {
    setStatus("forging.status.noChainCode");
    setChainActionStatus("forging.status.noChainCode", "error");
    return false;
  }
  return true;
}

async function forgeCurrentChainCodeOnChain() {
  if (forgeOnChainSubmitting) {
    setChainActionStatus("forging.status.chainSubmitting", "pending");
    return;
  }
  setChainActionStatus("forging.chainActionPreparing", "pending");
  if (!prepareCurrentChainCodeFromDialog()) return;
  const materialInputs = selectedBackpackMaterialInputsForPieces(pieces);
  if (!materialInputs.length) {
    setStatus("forging.status.chainMaterialRequired");
    setChainActionStatus("forging.status.chainMaterialRequired", "error");
    return;
  }
  const hotbarReservation = reserveForgedHotbarSlot();
  if (!hotbarReservation) {
    setStatus("forging.status.chainHotbarFull");
    setChainActionStatus("forging.status.chainHotbarFull", "error");
    return;
  }
  let hotbarCommitted = false;
  forgeOnChainSubmitting = true;
  if (forgeOnChainButton) forgeOnChainButton.disabled = true;
  setStatus("forging.status.chainSubmitting");
  setChainActionStatus("forging.status.chainSubmitting", "pending");
  try {
    const result = await forgeEquipmentOnChain({ code: currentChainCode, materialInputs });
    if (!result?.submitted) {
      releaseForgedHotbarReservation(hotbarReservation.id);
      const failureKey = chainFailureStatusKey(result?.reason);
      setStatus(failureKey);
      setChainActionStatus(failureKey, "error");
      return;
    }
    const savedItem = saveForgedItem(currentChainCode);
    hotbarCommitted = commitForgedHotbarReservation(hotbarReservation.id, savedItem);
    if (!hotbarCommitted) {
      setStatus("forging.status.chainHotbarQueueFailed");
      setChainActionStatus("forging.status.chainHotbarQueueFailed", "error");
      return;
    }
    setStatus("forging.status.chainSubmitted");
    setChainActionStatus("forging.status.chainSubmitted", "success");
    await syncBackpackMaterials({ force: true });
  } catch (error) {
    releaseForgedHotbarReservation(hotbarReservation.id);
    console.warn("Failed to forge equipment on chain", error);
    setStatus("forging.status.chainSubmitFailed");
    setChainActionStatus("forging.status.chainSubmitFailed", "error");
  } finally {
    if (!hotbarCommitted) releaseForgedHotbarReservation(hotbarReservation.id);
    forgeOnChainSubmitting = false;
    if (forgeOnChainButton) forgeOnChainButton.disabled = false;
  }
}

function chainFailureStatusKey(reason) {
  if (reason === "code-too-large") return "forging.status.chainCodeTooLarge";
  if (reason === "no-material-inputs") return "forging.status.chainMaterialRequired";
  if (reason === "material-mismatch") return "forging.status.chainMaterialMismatch";
  if (reason === "hotbar-full") return "forging.status.chainHotbarFull";
  if (reason === "wallet-unavailable") return "forging.status.chainWalletUnavailable";
  if (reason === "no-backpack") return "forging.status.chainNoBackpack";
  if (reason === "empty-code") return "forging.status.noChainCode";
  return "forging.status.chainSubmitFailed";
}

function selectedBackpackMaterialInputsForPieces(sourcePieces) {
  const inputs = [];
  const seen = new Set();
  for (const key of sourcePieces.flatMap(backpackMaterialEntryKeysForPiece)) {
    if (!key || seen.has(key)) continue;
    const entry = backpackMaterialEntryByKey(key);
    if (!entry || !Number.isInteger(entry.slotIndex)) continue;
    seen.add(key);
    inputs.push({
      key,
      slotIndex: entry.slotIndex,
      itemCode: entry.slot?.itemCode ?? 0,
      itemId: entry.slot?.itemId ?? "0",
      itemPda: entry.slot?.itemPda ?? "",
      volumeMm3: entry.volumeMm3 ?? 0,
      quantity: entry.quantity ?? 1,
      materialId: entry.id,
    });
  }
  return inputs;
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
    const piece = createPieceFromAppearance(blueprint.appearance, blueprint.equipmentStats);
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
  if (blueprint.equipmentStats && pieces.length) {
    pieces[0].equipmentStats = normalizeEquipmentStats(blueprint.equipmentStats);
  }
  selectPiece(pieces[0]);
  selectTool("gloves");
  updateHud();
  return true;
}

function forgeBlueprintFromPieces(sourcePieces) {
  const equipmentStats = equipmentStatsForPieces(sourcePieces);
  const baseVersion = forgeCodeVersionForStats(equipmentStats);
  if (sourcePieces.length === 1 && sourcePieces[0].appearance) {
    return { version: baseVersion, equipmentStats, appearance: sourcePieces[0].appearance };
  }
  const bounds = localBoundsForPieces(sourcePieces);
  const origin = bounds.getCenter(new THREE.Vector3());
  const components = [];
  for (const piece of sourcePieces) {
    for (const component of componentsFromPiece(piece)) {
      components.push({
        resourceId: component.resourceId ?? piece.resourceId ?? "iron",
        role: component.role ?? piece.role ?? resources[component.resourceId ?? piece.resourceId]?.role,
        color: (component.color ?? piece.color ?? new THREE.Color(resources[component.resourceId ?? piece.resourceId]?.color ?? resources.iron.color)).clone?.()
          ?? new THREE.Color(component.color ?? piece.color ?? resources[component.resourceId ?? piece.resourceId]?.color ?? resources.iron.color),
        dims: component.dims.clone(),
        offset: component.offset.clone().add(piece.offset).sub(origin),
        grid: { ...component.grid },
        solid: new Uint8Array(component.solid),
        paint: clonePaintRecords(component.paint),
        gripOffset: component.gripOffset?.clone?.().add(piece.offset).sub(origin) ?? null,
        gripNormal: component.gripNormal?.clone?.() ?? null,
        gripAngle: component.gripAngle ?? 0,
      });
    }
  }
  const colorSavingsBits = componentDefaultColorSavingsBits(components);
  const cutBoxSavingsBits = componentsCutBoxSolidSavingsBits(components);
  const extrudedMaskSavingsBits = componentsExtrudedMaskSolidSavingsBits(components);
  const solidVersion = extrudedMaskSavingsBits > cutBoxSavingsBits ? forgeExtrudedMaskSolidVersion : forgeCutBoxSolidVersion;
  const solidSavingsBits = Math.max(cutBoxSavingsBits, extrudedMaskSavingsBits);
  const version = baseVersion >= forgeZeroOffsetVersion && colorSavingsBits + solidSavingsBits > Math.max(0, colorSavingsBits)
    ? solidVersion
    : baseVersion >= forgeZeroOffsetVersion && colorSavingsBits > 0
      ? forgeDefaultColorVersion
      : baseVersion;
  return { version: componentsHavePaint(components) ? Math.max(version, forgePaintVersion) : version, equipmentStats, components };
}

function forgeCodeVersionForStats(stats = null) {
  return canUseCompactEquipmentStats(stats) ? forgeZeroOffsetVersion : forgeGripNormalVersion;
}

function canUseCompactEquipmentStats(stats = null) {
  const normalized = normalizeEquipmentStats(stats);
  if (!normalized) return true;
  return normalized.massGrams <= 0xffff * 5 && normalized.volumeCm3 <= 0xffff;
}

function encodeForgeCode(blueprint) {
  return forgeBytesToCode(encodeForgeBytes(blueprint));
}

function encodeForgeBytes(blueprint) {
  const writer = new BitWriter();
  writer.write(blueprint.version, 4);
  if (blueprint.version >= forgeEquipmentVersion) {
    writeEquipmentStats(writer, blueprint.equipmentStats, blueprint.version);
    writer.write(blueprint.appearance ? 1 : 0, 1);
    if (blueprint.appearance) {
      writeAppearanceBlueprint(
        writer,
        blueprint.appearance,
        true,
        blueprint.version >= forgeGripPoseVersion,
        blueprint.version >= forgeGripNormalVersion,
      );
      return writer.bytes();
    }
    writeComponentBlueprint(
      writer,
      blueprint.components ?? [],
      true,
      blueprint.version >= forgeGripPoseVersion,
      blueprint.version >= forgeGripNormalVersion,
      blueprint.version >= forgeSolidShortcutVersion,
      blueprint.version >= forgeZeroOffsetVersion,
      blueprint.version >= forgeDefaultColorVersion,
      blueprint.version >= forgeCutBoxSolidVersion,
      blueprint.version >= forgeExtrudedMaskSolidVersion,
      blueprint.version >= forgePaintVersion,
    );
    return writer.bytes();
  }
  if (blueprint.version === forgeAppearanceVersion && blueprint.appearance) {
    writeAppearanceBlueprint(writer, blueprint.appearance);
    return writer.bytes();
  }
  writeComponentBlueprint(writer, blueprint.components ?? []);
  return writer.bytes();
}

function writeComponentBlueprint(writer, components = [], includeColor = false, includeGripPose = false, includeGripNormal = false, includeSolidShortcut = false, includeZeroOffset = false, includeDefaultColor = false, includeCutBoxSolid = false, includeExtrudedMaskSolid = false, includePaint = false) {
  writer.write(Math.min(31, components.length), 5);
  for (const component of components.slice(0, 31)) {
    writer.write(Math.max(0, resourceIds.indexOf(component.resourceId)), 3);
    if (includeColor) {
      if (includeDefaultColor) writeComponentColor(writer, component.resourceId, component.color);
      else writeQuantizedColor(writer, component.color ?? resources[component.resourceId]?.color ?? resources.iron.color);
    }
    writeQuantizedUnsigned(writer, component.dims.x, 8, 64);
    writeQuantizedUnsigned(writer, component.dims.y, 8, 64);
    writeQuantizedUnsigned(writer, component.dims.z, 8, 64);
    if (includeZeroOffset) writeComponentOffset(writer, component.offset);
    else writeComponentOffsetLegacy(writer, component.offset);
    writer.write(component.gripOffset ? 1 : 0, 1);
    if (component.gripOffset) {
      writeQuantizedSigned(writer, component.gripOffset.x, 10, 64);
      writeQuantizedSigned(writer, component.gripOffset.y, 10, 64);
      writeQuantizedSigned(writer, component.gripOffset.z, 10, 64);
      if (includeGripNormal) writeGripNormal(writer, component.gripNormal);
      if (includeGripPose) writeGripPose(writer, component.gripAngle);
    }
    if (includeSolidShortcut) writeComponentSolid(writer, component.solid, component.grid, includeCutBoxSolid, includeExtrudedMaskSolid);
    else writeSolidRuns(writer, component.solid);
    if (includePaint) writeComponentPaint(writer, component);
  }
}

function writeEquipmentStats(writer, stats = null, version = forgeEquipmentVersion) {
  const normalized = normalizeEquipmentStats(stats);
  if (version >= forgeCompactStatsVersion) {
    writer.write(clampInteger(Math.round((normalized?.massGrams ?? 0) / 5), 0, 0xffff), 16);
    writer.write(clampInteger(normalized?.volumeCm3 ?? 0, 0, 0xffff), 16);
    for (const key of SMELTING_MATERIAL_ATTRIBUTE_KEYS) {
      writer.write(scoreToCompactAttribute(normalized?.attributes?.[key] ?? 0), 6);
    }
    return;
  }
  writer.write(normalized?.massGrams ?? 0, 22);
  writer.write(normalized?.volumeCm3 ?? 0, 22);
  writer.write(normalized?.densityKgM3 ?? 0, 14);
  for (const key of SMELTING_MATERIAL_ATTRIBUTE_KEYS) {
    writer.write(clampEquipmentScore(normalized?.attributes?.[key] ?? 0), 7);
  }
}

function writeAppearanceBlueprint(writer, appearance, includeColor = false, includeGripPose = false, includeGripNormal = false) {
  writeQuantizedUnsigned(writer, appearance.dims.x, 9, 32);
  writeQuantizedUnsigned(writer, appearance.dims.y, 9, 32);
  writeQuantizedUnsigned(writer, appearance.dims.z, 9, 32);
  writer.write(appearance.gripOffset ? 1 : 0, 1);
  if (appearance.gripOffset) {
    writeQuantizedSigned(writer, appearance.gripOffset.x, 11, 64);
    writeQuantizedSigned(writer, appearance.gripOffset.y, 11, 64);
    writeQuantizedSigned(writer, appearance.gripOffset.z, 11, 64);
    if (includeGripNormal) writeGripNormal(writer, appearance.gripNormal);
    if (includeGripPose) writeGripPose(writer, appearance.gripAngle);
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
  for (const quad of quads) writeCompressedAppearanceQuad(writer, quad, usePalette ? coordinatePalette : null, includeColor);
}

function writeCompressedAppearanceQuad(writer, quad, coordinatePalette = null, includeColor = false) {
  const fullU = quad.u0 === 0 && quad.u1 === appearanceGrid.x;
  const fullV = quad.v0 === 0 && quad.v1 === appearanceGrid.x;
  if (fullU && fullV) {
    writer.write(0, 1);
    writeAppearanceQuadHeader(writer, quad, coordinatePalette, includeColor);
    return;
  }
  if (fullU || fullV) {
    writer.write(2, 2);
    writeAppearanceQuadHeader(writer, quad, coordinatePalette, includeColor);
    writer.write(fullU ? 1 : 0, 1);
    writeAppearanceCoord(writer, fullU ? quad.v0 : quad.u0, coordinatePalette);
    writeAppearanceCoord(writer, fullU ? quad.v1 : quad.u1, coordinatePalette);
    return;
  }
  writer.write(3, 2);
  writeAppearanceQuadHeader(writer, quad, coordinatePalette, includeColor);
  writeAppearanceCoord(writer, quad.u0, coordinatePalette);
  writeAppearanceCoord(writer, quad.u1, coordinatePalette);
  writeAppearanceCoord(writer, quad.v0, coordinatePalette);
  writeAppearanceCoord(writer, quad.v1, coordinatePalette);
}

function writeAppearanceQuadHeader(writer, quad, coordinatePalette = null, includeColor = false) {
  writer.write(quad.axis, 2);
  writer.write(quad.side ? 1 : 0, 1);
  writer.write(Math.max(0, resourceIds.indexOf(quad.resourceId)), 3);
  writeAppearanceCoord(writer, quad.plane, coordinatePalette);
  if (includeColor) writeQuantizedColor(writer, quad.color ?? resources[quad.resourceId]?.color ?? resources.iron.color);
}

function writeAppearanceCoord(writer, value, coordinatePalette = null) {
  if (!coordinatePalette) {
    writer.write(THREE.MathUtils.clamp(value, 0, 31), 5);
    return;
  }
  const index = coordinatePalette.indexOf(THREE.MathUtils.clamp(value, 0, 31));
  writer.write(Math.max(0, index), bitsForPalette(coordinatePalette));
}

function writeGripPose(writer, angle = 0) {
  writer.write(angleToGripStep(angle), 2);
}

function writeGripNormal(writer, normal = null) {
  const vector = normal?.clone?.() ?? new THREE.Vector3(0, 1, 0);
  if (vector.lengthSq() < 0.0001) vector.set(0, 1, 0);
  vector.normalize();
  const axis = dominantAxis(vector);
  const sign = vector.getComponent(axis) >= 0 ? 1 : 0;
  writer.write((axis << 1) | sign, 3);
}

function angleToGripStep(angle = 0) {
  return Math.round(normalizeGripAngle(angle) / gripGestureRotationStepRadians) % 4;
}

function gripStepToAngle(step = 0) {
  return (step & 3) * gripGestureRotationStepRadians;
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
  if (version >= forgeEquipmentVersion) {
    const equipmentStats = readEquipmentStats(reader, version);
    if (reader.read(1) === 1) {
      const blueprint = readAppearanceBlueprint(reader, version);
      return { ...blueprint, equipmentStats };
    }
    return { version, equipmentStats, components: readComponentBlueprint(reader, version) };
  }
  if (version === legacyAppearanceVersion || version === forgeAppearanceVersion) return readAppearanceBlueprint(reader, version);
  return { version, components: readComponentBlueprint(reader, version) };
}

function readComponentBlueprint(reader, version) {
  const componentCount = reader.read(5);
  const components = [];
  for (let index = 0; index < componentCount; index++) {
    const resourceId = resourceIds[reader.read(3)] ?? "iron";
    const color = version >= forgeEquipmentVersion ? readComponentColor(reader, resourceId, version) : new THREE.Color(resources[resourceId]?.color ?? resources.iron.color);
    const dims = new THREE.Vector3(
      readQuantizedUnsigned(reader, 8, 64),
      readQuantizedUnsigned(reader, 8, 64),
      readQuantizedUnsigned(reader, 8, 64),
    );
    const offset = readComponentOffset(reader, version);
    const hasGripOffset = version >= 2 && reader.read(1) === 1;
    const gripOffset = hasGripOffset
      ? new THREE.Vector3(
          readQuantizedSigned(reader, 10, 64),
          readQuantizedSigned(reader, 10, 64),
          readQuantizedSigned(reader, 10, 64),
        )
      : null;
    const storedGripNormal = gripOffset && version >= forgeGripNormalVersion ? readGripNormal(reader) : null;
    const gripPose = gripOffset && version >= forgeGripPoseVersion ? readGripPose(reader) : null;
    const solid = readComponentSolid(reader, voxelGrid.x * voxelGrid.y * voxelGrid.z, version);
    const component = {
      resourceId,
      role: gripOffset ? "grip" : resources[resourceId]?.role,
      color,
      dims,
      offset,
      grid: { ...voxelGrid },
      gripOffset,
      gripAngle: gripPose?.angle ?? 0,
      solid,
    };
    if (version >= forgePaintVersion) component.paint = readComponentPaint(reader, component);
    component.gripNormal = gripOffset ? storedGripNormal ?? deriveGripNormalForComponent(component, gripOffset) : null;
    components.push(component);
  }
  return components;
}

function readEquipmentStats(reader, version = forgeEquipmentVersion) {
  if (version >= forgeCompactStatsVersion) {
    const massGrams = reader.read(16) * 5;
    const volumeCm3 = reader.read(16);
    const attributes = {};
    for (const key of SMELTING_MATERIAL_ATTRIBUTE_KEYS) {
      attributes[key] = compactAttributeToScore(reader.read(6));
    }
    return normalizeEquipmentStats({
      massGrams,
      volumeCm3,
      densityKgM3: deriveDensityKgM3FromMassVolume(massGrams, volumeCm3),
      attributes,
    });
  }
  const massGrams = reader.read(22);
  const volumeCm3 = reader.read(22);
  const densityKgM3 = reader.read(14);
  const attributes = {};
  for (const key of SMELTING_MATERIAL_ATTRIBUTE_KEYS) {
    attributes[key] = clampEquipmentScore(reader.read(7));
  }
  return normalizeEquipmentStats({ massGrams, volumeCm3, densityKgM3, attributes });
}

function scoreToCompactAttribute(value) {
  return clampInteger(Math.round(clampEquipmentScore(value) * 63 / 100), 0, 63);
}

function compactAttributeToScore(value) {
  return clampEquipmentScore(Math.round(clampInteger(value, 0, 63) * 100 / 63));
}

function deriveDensityKgM3FromMassVolume(massGrams, volumeCm3) {
  if (volumeCm3 <= 0 || massGrams <= 0) return 0;
  return clampInteger(Math.round(massGrams * 1000 / volumeCm3), 0, 0x3fff);
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
  const storedGripNormal = gripOffset && version >= forgeGripNormalVersion ? readGripNormal(reader) : null;
  const gripPose = gripOffset && version >= forgeGripPoseVersion ? readGripPose(reader) : null;
  const quadCount = reader.read(12);
  const quads = [];
  let coordinatePalette = null;
  if (version !== legacyAppearanceVersion && reader.read(1) === 1) {
    const coordinateCount = reader.read(5);
    coordinatePalette = [];
    for (let index = 0; index < coordinateCount; index++) coordinatePalette.push(reader.read(5));
  }
  for (let index = 0; index < quadCount; index++) {
    quads.push(version === legacyAppearanceVersion ? readLegacyAppearanceQuad(reader) : readCompressedAppearanceQuad(reader, coordinatePalette, version >= forgeEquipmentVersion));
  }
  const gripNormal = gripOffset ? storedGripNormal ?? deriveGripNormalForAppearance({ dims, quads }, gripOffset) : null;
  return {
    version,
    appearance: {
      dims,
      grid: { ...appearanceGrid },
      quads,
      gripOffset,
      gripNormal,
      gripAngle: gripPose?.angle ?? 0,
    },
  };
}

function readGripPose(reader) {
  return {
    angle: gripStepToAngle(reader.read(2)),
  };
}

function readGripNormal(reader) {
  const packed = reader.read(3);
  const axis = Math.min(2, packed >> 1);
  const sign = packed & 1 ? 1 : -1;
  const normal = new THREE.Vector3();
  normal.setComponent(axis, sign);
  return normal;
}

function deriveGripNormalForComponent(component, gripOffset) {
  if (!component?.solid || !component?.grid || !component?.dims || !gripOffset) return null;
  const localPoint = gripOffset.clone().sub(component.offset ?? new THREE.Vector3());
  const dirs = [
    { normal: new THREE.Vector3(1, 0, 0), neighbor: [1, 0, 0] },
    { normal: new THREE.Vector3(-1, 0, 0), neighbor: [-1, 0, 0] },
    { normal: new THREE.Vector3(0, 1, 0), neighbor: [0, 1, 0] },
    { normal: new THREE.Vector3(0, -1, 0), neighbor: [0, -1, 0] },
    { normal: new THREE.Vector3(0, 0, 1), neighbor: [0, 0, 1] },
    { normal: new THREE.Vector3(0, 0, -1), neighbor: [0, 0, -1] },
  ];
  let best = null;
  let bestScore = Infinity;
  for (let z = 0; z < component.grid.z; z++) {
    for (let y = 0; y < component.grid.y; y++) {
      for (let x = 0; x < component.grid.x; x++) {
        if (!isComponentSolid(component, x, y, z)) continue;
        for (const dir of dirs) {
          const [nx, ny, nz] = dir.neighbor;
          if (isComponentSolid(component, x + nx, y + ny, z + nz)) continue;
          const surfacePoint = componentSurfacePointForCell(component, [x, y, z], dir.normal, localPoint);
          const score = surfacePoint.distanceToSquared(localPoint);
          if (score < bestScore) {
            bestScore = score;
            best = dir.normal.clone();
          }
        }
      }
    }
  }
  return best;
}

function componentSurfacePointForCell(component, cell, normal, referencePoint) {
  const normalAxis = dominantAxis(normal);
  const sign = Math.sign(normal.getComponent(normalAxis)) || 1;
  const dims = [component.dims.x, component.dims.y, component.dims.z];
  const grid = [component.grid.x, component.grid.y, component.grid.z];
  const coordinate = [referencePoint.x, referencePoint.y, referencePoint.z];
  const axes = [0, 1, 2].filter((axis) => axis !== normalAxis);
  for (const axis of axes) {
    const min = -dims[axis] * 0.5 + cell[axis] * dims[axis] / grid[axis];
    const max = -dims[axis] * 0.5 + (cell[axis] + 1) * dims[axis] / grid[axis];
    coordinate[axis] = THREE.MathUtils.clamp(coordinate[axis], min, max);
  }
  coordinate[normalAxis] = -dims[normalAxis] * 0.5 +
    (sign > 0 ? cell[normalAxis] + 1 : cell[normalAxis]) * dims[normalAxis] / grid[normalAxis];
  return new THREE.Vector3(coordinate[0], coordinate[1], coordinate[2]);
}

function deriveGripNormalForAppearance(appearance, gripOffset) {
  if (!appearance?.dims || !gripOffset) return null;
  let best = null;
  let bestScore = Infinity;
  for (const quad of appearance.quads ?? []) {
    const candidate = nearestPointOnAppearanceQuad(appearance.dims, quad, gripOffset);
    if (!candidate) continue;
    const score = candidate.point.distanceToSquared(gripOffset);
    if (score < bestScore) {
      bestScore = score;
      best = candidate.normal;
    }
  }
  return best;
}

function nearestPointOnAppearanceQuad(dims, quad, point) {
  const gridSize = appearanceGridSize();
  const axis = quad.axis;
  const uAxis = axis === 0 ? 1 : 0;
  const vAxis = axis === 2 ? 1 : 2;
  const values = [point.x, point.y, point.z];
  const dimsArray = [dims.x, dims.y, dims.z];
  const gridArray = [gridSize.x, gridSize.y, gridSize.z];
  const axisValue = -dimsArray[axis] * 0.5 + (quad.plane / gridArray[axis]) * dimsArray[axis];
  const uMin = -dimsArray[uAxis] * 0.5 + (quad.u0 / gridArray[uAxis]) * dimsArray[uAxis];
  const uMax = -dimsArray[uAxis] * 0.5 + (quad.u1 / gridArray[uAxis]) * dimsArray[uAxis];
  const vMin = -dimsArray[vAxis] * 0.5 + (quad.v0 / gridArray[vAxis]) * dimsArray[vAxis];
  const vMax = -dimsArray[vAxis] * 0.5 + (quad.v1 / gridArray[vAxis]) * dimsArray[vAxis];
  values[axis] = axisValue;
  values[uAxis] = THREE.MathUtils.clamp(values[uAxis], uMin, uMax);
  values[vAxis] = THREE.MathUtils.clamp(values[vAxis], vMin, vMax);
  const normal = new THREE.Vector3();
  normal.setComponent(axis, quad.side ? 1 : -1);
  return { point: new THREE.Vector3(values[0], values[1], values[2]), normal };
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

function readCompressedAppearanceQuad(reader, coordinatePalette = null, includeColor = false) {
  if (reader.read(1) === 0) {
    return {
      ...readAppearanceQuadHeader(reader, coordinatePalette, includeColor),
      u0: 0,
      u1: appearanceGrid.x,
      v0: 0,
      v1: appearanceGrid.x,
    };
  }
  const isGeneral = reader.read(1) === 1;
  const quad = readAppearanceQuadHeader(reader, coordinatePalette, includeColor);
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

function readAppearanceQuadHeader(reader, coordinatePalette = null, includeColor = false) {
  const axis = reader.read(2);
  const side = reader.read(1);
  const resourceId = resourceIds[reader.read(3)] ?? "iron";
  const quad = {
    axis,
    side,
    resourceId,
    plane: readAppearanceCoord(reader, coordinatePalette),
  };
  if (includeColor) quad.color = `#${readQuantizedColor(reader).getHexString()}`;
  return quad;
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
      color: component.color?.clone?.() ?? new THREE.Color(component.color ?? resources[component.resourceId]?.color ?? resources.iron.color),
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

function writeComponentOffset(writer, offset = null) {
  if (componentOffsetQuantizesToZero(offset)) {
    writer.write(1, 1);
    return;
  }
  writer.write(0, 1);
  writeComponentOffsetLegacy(writer, offset);
}

function writeComponentOffsetLegacy(writer, offset = null) {
  writeQuantizedSigned(writer, offset?.x ?? 0, 10, 64);
  writeQuantizedSigned(writer, offset?.y ?? 0, 10, 64);
  writeQuantizedSigned(writer, offset?.z ?? 0, 10, 64);
}

function readComponentOffset(reader, version) {
  if (version >= forgeZeroOffsetVersion && reader.read(1) === 1) {
    return new THREE.Vector3();
  }
  return new THREE.Vector3(
    readQuantizedSigned(reader, 10, 64),
    readQuantizedSigned(reader, 10, 64),
    readQuantizedSigned(reader, 10, 64),
  );
}

function componentOffsetQuantizesToZero(offset = null) {
  return quantizedSignedInteger(offset?.x ?? 0, 10, 64) === 0
    && quantizedSignedInteger(offset?.y ?? 0, 10, 64) === 0
    && quantizedSignedInteger(offset?.z ?? 0, 10, 64) === 0;
}

function componentDefaultColorSavingsBits(components = []) {
  return components.reduce((sum, component) => (
    sum + (componentColorMatchesResourceDefault(component.resourceId, component.color) ? 11 : -1)
  ), 0);
}

function componentsCutBoxSolidSavingsBits(components = []) {
  return components.reduce((sum, component) => (
    sum + componentCutBoxSolidSavingsBits(component.solid, component.grid)
  ), 0);
}

function componentsExtrudedMaskSolidSavingsBits(components = []) {
  return components.reduce((sum, component) => (
    sum + componentExtrudedMaskSolidSavingsBits(component.solid, component.grid)
  ), 0);
}

function componentsHavePaint(components = []) {
  return components.some((component) => componentPaintQuads(component).length > 0);
}

function componentCutBoxSolidSavingsBits(solid, grid = voxelGrid) {
  return solidV10BitLength(solid) - solidV12BitLength(solid, grid);
}

function componentExtrudedMaskSolidSavingsBits(solid, grid = voxelGrid) {
  return solidV10BitLength(solid) - solidV13BitLength(solid, grid);
}

function solidV10BitLength(solid) {
  return solidIsFullySolid(solid) ? 1 : 1 + solidRunsBitLength(solid);
}

function solidV12BitLength(solid, grid = voxelGrid) {
  const encoding = compactSolidEncodingV12(solid, grid);
  if (encoding.mode === "full") return 2;
  if (encoding.mode === "boxes") return 2 + 5 + encoding.boxes.length * 24;
  return 2 + solidRunsBitLength(solid);
}

function solidV13BitLength(solid, grid = voxelGrid) {
  const encoding = compactSolidEncodingV13(solid, grid);
  if (encoding.mode === "full") return 2;
  if (encoding.mode === "boxes") return 2 + 5 + encoding.boxes.length * 24;
  if (encoding.mode === "extruded") return 2 + 2 + solidMaskRunsBitLength(encoding.mask);
  return 2 + solidRunsBitLength(solid);
}

function writeQuantizedSigned(writer, value, bits, scale) {
  const quantized = quantizedSignedInteger(value, bits, scale);
  writer.write(quantized < 0 ? (1 << bits) + quantized : quantized, bits);
}

function quantizedSignedInteger(value, bits, scale) {
  const maxPositive = (1 << (bits - 1)) - 1;
  const minNegative = -(1 << (bits - 1));
  return THREE.MathUtils.clamp(Math.round((Number(value) || 0) * scale), minNegative, maxPositive);
}

function writeQuantizedColor(writer, colorValue) {
  writer.write(quantizedColorValue(colorValue), 12);
}

function writeComponentColor(writer, resourceId, colorValue) {
  if (componentColorMatchesResourceDefault(resourceId, colorValue)) {
    writer.write(1, 1);
    return;
  }
  writer.write(0, 1);
  writeQuantizedColor(writer, colorValue ?? resources[resourceId]?.color ?? resources.iron.color);
}

function readComponentColor(reader, resourceId, version) {
  if (version >= forgeDefaultColorVersion && reader.read(1) === 1) {
    return new THREE.Color(resources[resourceId]?.color ?? resources.iron.color);
  }
  return readQuantizedColor(reader);
}

function componentColorMatchesResourceDefault(resourceId, colorValue) {
  return quantizedColorValue(colorValue ?? resources[resourceId]?.color ?? resources.iron.color)
    === quantizedColorValue(resources[resourceId]?.color ?? resources.iron.color);
}

function quantizedColorValue(colorValue) {
  const color = colorValue instanceof THREE.Color
    ? colorValue
    : new THREE.Color(colorValue ?? 0xffffff);
  const r = THREE.MathUtils.clamp(Math.round(color.r * 15), 0, 15);
  const g = THREE.MathUtils.clamp(Math.round(color.g * 15), 0, 15);
  const b = THREE.MathUtils.clamp(Math.round(color.b * 15), 0, 15);
  return (r << 8) | (g << 4) | b;
}

function readQuantizedColor(reader) {
  const value = reader.read(12);
  return new THREE.Color(
    ((value >> 8) & 0xf) / 15,
    ((value >> 4) & 0xf) / 15,
    (value & 0xf) / 15,
  );
}

function colorStringFromQuantized(value) {
  const hex = (channel) => {
    const expanded = channel * 17;
    return expanded.toString(16).padStart(2, "0");
  };
  return `#${hex((value >> 8) & 0xf)}${hex((value >> 4) & 0xf)}${hex(value & 0xf)}`;
}

function readQuantizedSigned(reader, bits, scale) {
  const value = reader.read(bits);
  const sign = 1 << (bits - 1);
  return (value >= sign ? value - (1 << bits) : value) / scale;
}

function writeComponentSolid(writer, solid, grid = voxelGrid, includeCutBoxSolid = false, includeExtrudedMaskSolid = false) {
  if (includeExtrudedMaskSolid) {
    writeComponentSolidV13(writer, solid, grid);
    return;
  }
  if (includeCutBoxSolid) {
    writeComponentSolidV12(writer, solid, grid);
    return;
  }
  if (solidIsFullySolid(solid)) {
    writer.write(1, 1);
    return;
  }
  writer.write(0, 1);
  writeSolidRuns(writer, solid);
}

function readComponentSolid(reader, total, version) {
  if (version >= forgeExtrudedMaskSolidVersion) {
    const mode = reader.read(2);
    if (mode === 1) return new Uint8Array(total).fill(1);
    if (mode === 2) return readSolidCutBoxes(reader, total, voxelGrid);
    if (mode === 3) return readSolidExtrudedMask(reader, total, voxelGrid);
    return readSolidRuns(reader, total);
  }
  if (version >= forgeCutBoxSolidVersion) {
    const mode = reader.read(2);
    if (mode === 1) return new Uint8Array(total).fill(1);
    if (mode === 2) return readSolidCutBoxes(reader, total, voxelGrid);
    return readSolidRuns(reader, total);
  }
  if (version >= forgeSolidShortcutVersion && reader.read(1) === 1) {
    return new Uint8Array(total).fill(1);
  }
  return readSolidRuns(reader, total);
}

function writeComponentPaint(writer, component) {
  const quads = componentPaintQuads(component);
  if (quads.length > 2047) throw new Error("paint-too-complex");
  writer.write(quads.length, 11);
  for (const quad of quads) {
    writer.write(quad.axis, 2);
    writer.write(quad.side, 1);
    writer.write(quad.plane, 4);
    writer.write(quad.u0, 4);
    writer.write(quad.u1, 4);
    writer.write(quad.v0, 4);
    writer.write(quad.v1, 4);
    writer.write(quad.colorValue, 12);
  }
}

function readComponentPaint(reader, component) {
  const paint = [];
  const quadCount = reader.read(11);
  for (let index = 0; index < quadCount; index++) {
    const axis = Math.min(2, reader.read(2));
    const side = reader.read(1);
    const plane = reader.read(4);
    const u0 = reader.read(4);
    const u1 = reader.read(4);
    const v0 = reader.read(4);
    const v1 = reader.read(4);
    const color = colorStringFromQuantized(reader.read(12));
    paint.push(...paintRecordsFromQuad(component, { axis, side, plane, u0, u1, v0, v1, color }));
  }
  return paint;
}

function componentPaintQuads(component) {
  if (!Array.isArray(component?.paint) || !component.paint.length) return [];
  const grid = component.grid ?? voxelGrid;
  const planes = new Map();
  for (const record of component.paint) {
    if (!validPaintRecord(record, grid)) continue;
    if (!isExposedPaintCell(component, [record.x, record.y, record.z], record.axis, record.side)) continue;
    const colorValue = quantizedColorValue(record.color);
    const baseColorValue = quantizedColorValue(component.color ?? resources[component.resourceId]?.color ?? resources.iron.color);
    if (colorValue === baseColorValue) continue;
    const tangentAxes = [0, 1, 2].filter((axis) => axis !== record.axis);
    const uAxis = tangentAxes[0];
    const vAxis = tangentAxes[1];
    const plane = record.side ? record[axisKey(record.axis)] + 1 : record[axisKey(record.axis)];
    const key = `${record.axis}:${record.side}:${plane}`;
    let entry = planes.get(key);
    if (!entry) {
      entry = {
        axis: record.axis,
        side: record.side,
        plane,
        width: grid[axisKey(uAxis)],
        height: grid[axisKey(vAxis)],
        mask: new Int32Array(grid[axisKey(uAxis)] * grid[axisKey(vAxis)]),
      };
      planes.set(key, entry);
    }
    entry.mask[record[axisKey(uAxis)] + entry.width * record[axisKey(vAxis)]] = colorValue + 1;
  }
  const quads = [];
  for (const entry of planes.values()) appendPaintMaskQuads(quads, entry);
  return quads;
}

function appendPaintMaskQuads(quads, entry) {
  const { mask, width, height, axis, side, plane } = entry;
  for (let v = 0; v < height; v++) {
    for (let u = 0; u < width; u++) {
      const value = mask[u + width * v];
      if (!value) continue;
      let rectWidth = 1;
      while (u + rectWidth < width && mask[u + rectWidth + width * v] === value) rectWidth++;
      let rectHeight = 1;
      scanHeight:
      while (v + rectHeight < height) {
        for (let offsetU = 0; offsetU < rectWidth; offsetU++) {
          if (mask[u + offsetU + width * (v + rectHeight)] !== value) break scanHeight;
        }
        rectHeight++;
      }
      for (let dy = 0; dy < rectHeight; dy++) {
        for (let dx = 0; dx < rectWidth; dx++) mask[u + dx + width * (v + dy)] = 0;
      }
      quads.push({
        axis,
        side,
        plane,
        u0: u,
        u1: u + rectWidth,
        v0: v,
        v1: v + rectHeight,
        colorValue: value - 1,
      });
    }
  }
}

function paintRecordsFromQuad(component, quad) {
  const records = [];
  const tangentAxes = [0, 1, 2].filter((axis) => axis !== quad.axis);
  const uAxis = tangentAxes[0];
  const vAxis = tangentAxes[1];
  const gridSize = [component.grid.x, component.grid.y, component.grid.z];
  const cellAxisValue = quad.side ? quad.plane - 1 : quad.plane;
  if (cellAxisValue < 0 || cellAxisValue >= gridSize[quad.axis]) return records;
  const uStart = Math.max(0, Math.min(gridSize[uAxis], quad.u0));
  const uEnd = Math.max(uStart, Math.min(gridSize[uAxis], quad.u1));
  const vStart = Math.max(0, Math.min(gridSize[vAxis], quad.v0));
  const vEnd = Math.max(vStart, Math.min(gridSize[vAxis], quad.v1));
  for (let v = vStart; v < vEnd; v++) {
    for (let u = uStart; u < uEnd; u++) {
      const cell = [0, 0, 0];
      cell[quad.axis] = cellAxisValue;
      cell[uAxis] = u;
      cell[vAxis] = v;
      if (!isExposedPaintCell(component, cell, quad.axis, quad.side)) continue;
      records.push({
        axis: quad.axis,
        side: quad.side,
        x: cell[0],
        y: cell[1],
        z: cell[2],
        color: quad.color,
      });
    }
  }
  return records;
}

function writeComponentSolidV13(writer, solid, grid = voxelGrid) {
  const encoding = compactSolidEncodingV13(solid, grid);
  if (encoding.mode === "full") {
    writer.write(1, 2);
    return;
  }
  if (encoding.mode === "boxes") {
    writer.write(2, 2);
    writer.write(encoding.boxes.length, 5);
    for (const box of encoding.boxes) writeSolidCutBox(writer, box);
    return;
  }
  if (encoding.mode === "extruded") {
    writer.write(3, 2);
    writer.write(encoding.axis, 2);
    writeSolidMaskRuns(writer, encoding.mask);
    return;
  }
  writer.write(0, 2);
  writeSolidRuns(writer, solid);
}

function writeComponentSolidV12(writer, solid, grid = voxelGrid) {
  const encoding = compactSolidEncodingV12(solid, grid);
  if (encoding.mode === "full") {
    writer.write(1, 2);
    return;
  }
  if (encoding.mode === "boxes") {
    writer.write(2, 2);
    writer.write(encoding.boxes.length, 5);
    for (const box of encoding.boxes) writeSolidCutBox(writer, box);
    return;
  }
  writer.write(0, 2);
  writeSolidRuns(writer, solid);
}

function compactSolidEncodingV13(solid, grid = voxelGrid) {
  const v12Encoding = compactSolidEncodingV12(solid, grid);
  let best = { ...v12Encoding, bits: solidV12BitLength(solid, grid) };
  const extruded = extrudedSolidMask(solid, grid);
  if (extruded?.bits < best.bits) best = { mode: "extruded", ...extruded };
  return best;
}

function compactSolidEncodingV12(solid, grid = voxelGrid) {
  if (solidIsFullySolid(solid)) return { mode: "full" };
  const boxes = solidCutBoxes(solid, grid);
  const rleBits = 2 + solidRunsBitLength(solid);
  const boxBits = boxes ? 2 + 5 + boxes.length * 24 : Infinity;
  if (boxes?.length && boxBits < rleBits) return { mode: "boxes", boxes };
  return { mode: "rle" };
}

function solidIsFullySolid(solid) {
  if (!solid?.length) return false;
  for (const value of solid) if (value !== 1) return false;
  return true;
}

function solidRunsBitLength(solid) {
  return 1 + 11 + solidRunCount(solid) * 11;
}

function solidMaskRunsBitLength(mask) {
  return 1 + 8 + solidMaskRunCount(mask) * 8;
}

function solidRunCount(solid) {
  let current = solid?.[0] ?? 0;
  let length = 0;
  let runs = 0;
  for (const value of solid ?? []) {
    if (value === current && length < 2047) {
      length++;
      continue;
    }
    runs++;
    current = value;
    length = 1;
  }
  return solid?.length ? runs + 1 : 1;
}

function solidMaskRunCount(mask) {
  let current = mask?.[0] ?? 0;
  let length = 0;
  let runs = 0;
  for (const value of mask ?? []) {
    if (value === current && length < 255) {
      length++;
      continue;
    }
    runs++;
    current = value;
    length = 1;
  }
  return mask?.length ? runs + 1 : 1;
}

function extrudedSolidMask(solid, grid = voxelGrid) {
  const total = grid.x * grid.y * grid.z;
  if (!solid || solid.length !== total || solidIsFullySolid(solid)) return null;
  let best = null;
  for (let axis = 0; axis < 3; axis++) {
    const mask = solidMaskForExtrudedAxis(solid, grid, axis);
    if (!mask) continue;
    const bits = 2 + 2 + solidMaskRunsBitLength(mask);
    if (!best || bits < best.bits) best = { axis, mask, bits };
  }
  return best;
}

function solidMaskForExtrudedAxis(solid, grid, axis) {
  const tangentAxes = [0, 1, 2].filter((item) => item !== axis);
  const width = grid[axisKey(tangentAxes[0])];
  const height = grid[axisKey(tangentAxes[1])];
  const layers = grid[axisKey(axis)];
  const mask = new Uint8Array(width * height);
  for (let v = 0; v < height; v++) {
    for (let u = 0; u < width; u++) {
      const cell = [0, 0, 0];
      cell[axis] = 0;
      cell[tangentAxes[0]] = u;
      cell[tangentAxes[1]] = v;
      mask[u + width * v] = solid[voxelIndex(grid, cell[0], cell[1], cell[2])] ? 1 : 0;
    }
  }
  for (let layer = 1; layer < layers; layer++) {
    for (let v = 0; v < height; v++) {
      for (let u = 0; u < width; u++) {
        const cell = [0, 0, 0];
        cell[axis] = layer;
        cell[tangentAxes[0]] = u;
        cell[tangentAxes[1]] = v;
        const value = solid[voxelIndex(grid, cell[0], cell[1], cell[2])] ? 1 : 0;
        if (value !== mask[u + width * v]) return null;
      }
    }
  }
  return mask;
}

function solidCutBoxes(solid, grid = voxelGrid, maxBoxes = 31) {
  const total = grid.x * grid.y * grid.z;
  if (!solid || solid.length !== total) return null;
  const covered = new Uint8Array(total);
  const boxes = [];
  while (true) {
    const start = firstUncoveredEmptyCell(solid, covered, grid);
    if (!start) return boxes;
    if (boxes.length >= maxBoxes) return null;
    const box = growEmptyCutBox(solid, covered, grid, start);
    boxes.push(box);
    markCutBoxCovered(covered, grid, box);
  }
}

function firstUncoveredEmptyCell(solid, covered, grid) {
  for (let z = 0; z < grid.z; z++) {
    for (let y = 0; y < grid.y; y++) {
      for (let x = 0; x < grid.x; x++) {
        const index = voxelIndex(grid, x, y, z);
        if (solid[index] !== 1 && covered[index] !== 1) return { x, y, z };
      }
    }
  }
  return null;
}

function growEmptyCutBox(solid, covered, grid, start) {
  let sx = 1;
  while (start.x + sx < grid.x && emptyCellAvailable(solid, covered, grid, start.x + sx, start.y, start.z)) sx++;
  let sy = 1;
  growY:
  while (start.y + sy < grid.y) {
    for (let x = start.x; x < start.x + sx; x++) {
      if (!emptyCellAvailable(solid, covered, grid, x, start.y + sy, start.z)) break growY;
    }
    sy++;
  }
  let sz = 1;
  growZ:
  while (start.z + sz < grid.z) {
    for (let y = start.y; y < start.y + sy; y++) {
      for (let x = start.x; x < start.x + sx; x++) {
        if (!emptyCellAvailable(solid, covered, grid, x, y, start.z + sz)) break growZ;
      }
    }
    sz++;
  }
  return { x: start.x, y: start.y, z: start.z, sx, sy, sz };
}

function emptyCellAvailable(solid, covered, grid, x, y, z) {
  const index = voxelIndex(grid, x, y, z);
  return solid[index] !== 1 && covered[index] !== 1;
}

function markCutBoxCovered(covered, grid, box) {
  for (let z = box.z; z < box.z + box.sz; z++) {
    for (let y = box.y; y < box.y + box.sy; y++) {
      for (let x = box.x; x < box.x + box.sx; x++) covered[voxelIndex(grid, x, y, z)] = 1;
    }
  }
}

function writeSolidCutBox(writer, box) {
  writer.write(THREE.MathUtils.clamp(box.x, 0, 15), 4);
  writer.write(THREE.MathUtils.clamp(box.y, 0, 15), 4);
  writer.write(THREE.MathUtils.clamp(box.z, 0, 15), 4);
  writer.write(THREE.MathUtils.clamp(box.sx, 1, 15), 4);
  writer.write(THREE.MathUtils.clamp(box.sy, 1, 15), 4);
  writer.write(THREE.MathUtils.clamp(box.sz, 1, 15), 4);
}

function writeSolidMaskRuns(writer, mask) {
  const runs = [];
  let current = mask[0] ?? 0;
  let length = 0;
  for (const value of mask) {
    if (value === current && length < 255) {
      length++;
      continue;
    }
    runs.push(length);
    current = value;
    length = 1;
  }
  runs.push(length);
  writer.write(mask[0] ?? 0, 1);
  writer.write(Math.min(runs.length, 255), 8);
  for (const run of runs.slice(0, 255)) writer.write(run, 8);
}

function readSolidExtrudedMask(reader, total, grid = voxelGrid) {
  const axis = Math.min(2, reader.read(2));
  const tangentAxes = [0, 1, 2].filter((item) => item !== axis);
  const width = grid[axisKey(tangentAxes[0])];
  const height = grid[axisKey(tangentAxes[1])];
  const layers = grid[axisKey(axis)];
  const mask = readSolidMaskRuns(reader, width * height);
  const solid = new Uint8Array(total);
  for (let layer = 0; layer < layers; layer++) {
    for (let v = 0; v < height; v++) {
      for (let u = 0; u < width; u++) {
        const cell = [0, 0, 0];
        cell[axis] = layer;
        cell[tangentAxes[0]] = u;
        cell[tangentAxes[1]] = v;
        solid[voxelIndex(grid, cell[0], cell[1], cell[2])] = mask[u + width * v];
      }
    }
  }
  return solid;
}

function readSolidMaskRuns(reader, total) {
  const mask = new Uint8Array(total);
  let value = reader.read(1);
  const runCount = reader.read(8);
  let cursor = 0;
  for (let index = 0; index < runCount; index++) {
    const length = reader.read(8);
    mask.fill(value, cursor, Math.min(total, cursor + length));
    cursor += length;
    value = value ? 0 : 1;
  }
  return mask;
}

function readSolidCutBoxes(reader, total, grid = voxelGrid) {
  const solid = new Uint8Array(total).fill(1);
  const boxCount = reader.read(5);
  for (let index = 0; index < boxCount; index++) {
    const box = {
      x: reader.read(4),
      y: reader.read(4),
      z: reader.read(4),
      sx: reader.read(4),
      sy: reader.read(4),
      sz: reader.read(4),
    };
    for (let z = box.z; z < Math.min(grid.z, box.z + box.sz); z++) {
      for (let y = box.y; y < Math.min(grid.y, box.y + box.sy); y++) {
        for (let x = box.x; x < Math.min(grid.x, box.x + box.sx); x++) solid[voxelIndex(grid, x, y, z)] = 0;
      }
    }
  }
  return solid;
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
  const workpiece = currentWorkpieceProfile();
  const materialNames = workpiece ? [...new Set(workpiece.materialIds)]
    .map((id) => materialDisplayName(id))
    .join(" + ") : "";
  materialValue.textContent = materialNames || "-";
  heatValue.textContent = workpiece ? t("forging.percent", { value: Math.round(workpiece.heat) }) : t("forging.percent", { value: 0 });
  massValue.textContent = workpiece ? formatMassKg(workpiece.mass) : "0 kg";
  const shape = workpiece
    ? t("forging.shapeValue", {
        x: workpiece.dims.x.toFixed(2),
        y: workpiece.dims.y.toFixed(2),
        z: workpiece.dims.z.toFixed(2),
      })
    : "-";
  shapeValue.textContent = shape;
  shapeText.textContent = shape;
  renderAttributePanel(workpiece);
}

function renderAttributePanel(workpiece) {
  if (!attributePanel) return;
  if (!workpiece) {
    attributePanel.replaceChildren(createDetailEmptyState("forging.workpieceEmpty", "forging.workpieceEmptyDetail"));
    return;
  }
  const header = document.createElement("div");
  header.className = "attribute-panel-head";
  const title = document.createElement("strong");
  title.textContent = t("forging.attributes");
  const detail = document.createElement("span");
  detail.textContent = workpiece.components?.length > 1
    ? t("forging.componentCount", { count: workpiece.components.length })
    : t("forging.singleComponent");
  header.append(title, detail);

  const strength = gripStrengthRequirement(workpiece);
  const stats = document.createElement("div");
  stats.className = "attribute-grid";
  for (const [label, value] of [
    [t("forging.attributeWeight"), formatMassKg(workpiece.mass)],
    [t("forging.attributeVolume"), formatVolumeLiters(workpiece.volumeM3)],
    [t("forging.attributeDensity"), formatDensityKgM3(workpiece.densityKgM3)],
    [t("forging.attributeHardness"), formatScore(workpiece.attributes?.hardness)],
    [t("forging.attributeDurability"), formatScore(workpiece.attributes?.durability)],
    [t("forging.attributeToughness"), formatScore(workpiece.attributes?.toughness)],
    [t("forging.attributeWorkability"), formatScore(workpiece.attributes?.workability)],
    [t("forging.attributeGripForce"), formatGripStrengthRequirement(strength)],
    [t("forging.attributeTorque"), strength.hasGrip ? formatTorqueNm(strength.torqueNm) : t("forging.gripNotSet")],
    [t("forging.attributeCenterOfMass"), formatVectorMeters(workpiece.centerOfMassScene)],
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
  const breakdownHead = document.createElement("div");
  breakdownHead.className = "attribute-breakdown-title";
  const breakdownTitle = document.createElement("span");
  breakdownTitle.textContent = t("forging.materialBreakdown");
  const breakdownTotal = document.createElement("b");
  breakdownTotal.textContent = formatMassKg(workpiece.mass);
  breakdownHead.append(breakdownTitle, breakdownTotal);
  breakdown.append(breakdownHead);
  for (const component of materialBreakdownForWorkpiece(workpiece).slice(0, 10)) {
    const item = document.createElement("div");
    const name = document.createElement("span");
    name.textContent = materialDisplayName(component.materialId);
    const values = document.createElement("b");
    values.textContent = t("forging.materialShareValue", {
      mass: formatMassKg(component.mass),
      volume: formatVolumeLiters(component.volumeM3),
      percent: Math.round(component.massShare * 100),
    });
    item.append(name, values);
    breakdown.append(item);
  }

  attributePanel.replaceChildren(header, stats, breakdown);
}

function currentWorkpieceProfile() {
  return workpieceProfileForPieces(pieces);
}

function workpieceProfileForPieces(sourcePieces) {
  if (!sourcePieces.length) return null;
  const statsProfile = equipmentStatsProfileForPieces(sourcePieces);
  if (statsProfile) return statsProfile;
  return computedWorkpieceProfileForPieces(sourcePieces);
}

function computedWorkpieceProfileForPieces(sourcePieces) {
  if (!sourcePieces.length) return null;
  const components = physicalComponentsForPieces(sourcePieces);
  const bounds = localBoundsForPieces(sourcePieces);
  const dims = bounds.getSize(new THREE.Vector3());
  const mass = roundPhysicalValue(components.reduce((sum, component) => sum + componentMassKg(component), 0), 4);
  const volumeM3 = components.reduce((sum, component) => sum + componentSolidVolumeM3(component), 0);
  const centerOfMassScene = centerOfMassForComponents(components);
  const materialIds = [...new Set(components.flatMap((component) => component.materialIds?.length ? component.materialIds : [component.resourceId]))];
  const heatMass = components.reduce((sum, component) => sum + componentMassKg(component) * (component.heat ?? 0), 0);
  const grip = workpieceGripWorldOffset(sourcePieces);
  return {
    components,
    materialIds,
    heat: mass > 0 ? heatMass / mass : 0,
    mass,
    volumeM3,
    densityKgM3: volumeM3 > 0 ? roundPhysicalValue(mass / volumeM3, 2) : materialDensityKgM3(),
    attributes: equipmentAttributesForComponents(components),
    dims,
    centerOfMassScene,
    gripWorldOffset: grip?.point ?? null,
    gripNormal: grip?.normal ?? null,
    gripAngle: grip?.angle ?? 0,
  };
}

function equipmentStatsProfileForPieces(sourcePieces) {
  if (!sourcePieces.length || !sourcePieces[0]?.equipmentStats) return null;
  const stats = normalizeEquipmentStats(sourcePieces[0].equipmentStats);
  if (!stats) return null;
  const components = physicalComponentsForPieces(sourcePieces);
  const bounds = localBoundsForPieces(sourcePieces);
  const dims = bounds.getSize(new THREE.Vector3());
  const grip = workpieceGripWorldOffset(sourcePieces);
  return {
    components,
    materialIds: [...new Set(components.flatMap((component) => component.materialIds?.length ? component.materialIds : [component.resourceId]))],
    heat: 0,
    mass: stats.massKg,
    volumeM3: stats.volumeM3,
    densityKgM3: stats.densityKgM3,
    attributes: { ...stats.attributes },
    dims,
    centerOfMassScene: centerOfMassForComponents(components),
    gripWorldOffset: grip?.point ?? null,
    gripNormal: grip?.normal ?? null,
    gripAngle: grip?.angle ?? 0,
  };
}

function physicalComponentsForPieces(sourcePieces) {
  const components = [];
  for (const piece of sourcePieces) {
    for (const component of componentsFromPiece(piece)) {
      const clone = {
        ...component,
        materialIds: [...(component.materialIds ?? piece.materialIds ?? [])],
        dims: component.dims.clone(),
        offset: component.offset?.clone?.() ?? new THREE.Vector3(),
        grid: { ...component.grid },
        solid: component.solid,
        solidCells: component.solidCells ?? solidCellsFor(component),
        fullSolid: component.fullSolid,
        densityKgM3: component.densityKgM3 ?? piece.densityKgM3,
        heat: piece.heat ?? 0,
        worldOffset: piece.offset.clone().add(component.offset ?? new THREE.Vector3()),
      };
      components.push(clone);
    }
  }
  return components;
}

function centerOfMassForComponents(components) {
  const weighted = new THREE.Vector3();
  let totalMass = 0;
  for (const component of components) {
    const mass = componentMassKg(component);
    if (mass <= 0) continue;
    const center = component.worldOffset.clone().add(componentSolidCentroidOffset(component));
    weighted.addScaledVector(center, mass);
    totalMass += mass;
  }
  return totalMass > 0 ? weighted.multiplyScalar(1 / totalMass) : new THREE.Vector3();
}

function componentSolidCentroidOffset(component) {
  const cells = component.solidCells ?? solidCellsFor(component);
  if (!cells.length) return new THREE.Vector3();
  const cellSize = new THREE.Vector3(
    component.dims.x / component.grid.x,
    component.dims.y / component.grid.y,
    component.dims.z / component.grid.z,
  );
  const centroid = new THREE.Vector3();
  for (const [x, y, z] of cells) {
    centroid.x += -component.dims.x * 0.5 + (x + 0.5) * cellSize.x;
    centroid.y += -component.dims.y * 0.5 + (y + 0.5) * cellSize.y;
    centroid.z += -component.dims.z * 0.5 + (z + 0.5) * cellSize.z;
  }
  return centroid.multiplyScalar(1 / cells.length);
}

function workpieceGripWorldOffset(sourcePieces) {
  for (const piece of sourcePieces) {
    const ownGrip = piece.gripOffset ?? piece.appearance?.gripOffset ?? null;
    const ownNormal = piece.gripNormal ?? piece.appearance?.gripNormal ?? null;
    if (ownGrip && ownNormal) {
      return {
        point: piece.offset.clone().add(ownGrip),
        normal: ownNormal.clone(),
        angle: piece.gripAngle ?? piece.appearance?.gripAngle ?? 0,
      };
    }
    for (const component of componentsFromPiece(piece)) {
      if (!component.gripOffset || !component.gripNormal) continue;
      return {
        point: piece.offset.clone().add(component.gripOffset),
        normal: component.gripNormal.clone(),
        angle: component.gripAngle ?? piece.gripAngle ?? 0,
      };
    }
  }
  return null;
}

function gripStrengthRequirement(workpiece) {
  if (!workpiece?.gripWorldOffset) {
    return { hasGrip: false, torqueNm: 0, forceN: 0, requiredForceN: 0 };
  }
  const pivot = workpiece.gripWorldOffset.clone();
  let torqueNm = 0;
  for (const component of workpiece.components) {
    const mass = componentMassKg(component);
    if (mass <= 0) continue;
    const center = component.worldOffset.clone().add(componentSolidCentroidOffset(component));
    const radiusM = center.sub(pivot).multiplyScalar(forgeMetersPerSceneUnit);
    const force = new THREE.Vector3(0, -mass * gravityMs2, 0);
    torqueNm += new THREE.Vector3().crossVectors(radiusM, force).length();
  }
  const weightN = workpiece.mass * gravityMs2;
  const torqueCounterForceN = torqueNm / gripForceLeverArmM;
  return {
    hasGrip: true,
    torqueNm: roundPhysicalValue(torqueNm, 4),
    forceN: roundPhysicalValue(weightN, 3),
    requiredForceN: roundPhysicalValue(weightN + torqueCounterForceN, 3),
  };
}

function materialBreakdownForWorkpiece(workpiece) {
  const totals = new Map();
  for (const component of workpiece?.components ?? []) {
    const ids = component.materialIds?.length ? component.materialIds : [component.resourceId ?? "iron"];
    const mass = componentMassKg(component) / ids.length;
    const volumeM3 = componentSolidVolumeM3(component) / ids.length;
    for (const materialId of ids) {
      const current = totals.get(materialId) ?? { materialId, mass: 0, volumeM3: 0 };
      current.mass += mass;
      current.volumeM3 += volumeM3;
      totals.set(materialId, current);
    }
  }
  return [...totals.values()]
    .map((entry) => ({
      ...entry,
      mass: roundPhysicalValue(entry.mass, 4),
      volumeM3: roundPhysicalValue(entry.volumeM3, 8),
      massShare: workpiece?.mass > 0 ? entry.mass / workpiece.mass : 0,
    }))
    .sort((a, b) => b.mass - a.mass);
}

function equipmentAttributesForComponents(components = []) {
  const totals = Object.fromEntries(SMELTING_MATERIAL_ATTRIBUTE_KEYS.map((key) => [key, 0]));
  let totalWeight = 0;
  for (const component of components) {
    const mass = componentMassKg(component);
    const weight = mass > 0 ? mass : componentSolidVolumeM3(component);
    if (weight <= 0) continue;
    const attributes = componentMaterialAttributes(component);
    for (const key of SMELTING_MATERIAL_ATTRIBUTE_KEYS) totals[key] += (attributes[key] ?? 0) * weight;
    totalWeight += weight;
  }
  const result = {};
  for (const key of SMELTING_MATERIAL_ATTRIBUTE_KEYS) {
    result[key] = clampEquipmentScore(totalWeight > 0 ? Math.round(totals[key] / totalWeight) : 0);
  }
  return result;
}

function componentMaterialAttributes(component) {
  const materialIds = component?.materialIds?.length ? component.materialIds : [];
  if (materialIds.length) {
    const totals = Object.fromEntries(SMELTING_MATERIAL_ATTRIBUTE_KEYS.map((key) => [key, 0]));
    let count = 0;
    for (const materialId of materialIds) {
      const material = smeltingMaterialById(materialId);
      if (!material) continue;
      const attributes = smeltingMaterialBaseAttributes(material);
      for (const key of SMELTING_MATERIAL_ATTRIBUTE_KEYS) totals[key] += attributes[key] ?? 0;
      count += 1;
    }
    if (count > 0) {
      const result = {};
      for (const key of SMELTING_MATERIAL_ATTRIBUTE_KEYS) result[key] = clampEquipmentScore(Math.round(totals[key] / count));
      return result;
    }
  }
  const resource = resources[component?.resourceId] ?? resources.iron;
  const densityScore = Math.max(1, Math.min(100, Math.round((resource.densityKgM3 ?? materialDensityKgM3()) / 100)));
  return {
    hardness: clampEquipmentScore(Math.round((resource.hardness ?? 0.5) * 100)),
    durability: clampEquipmentScore(Math.round((resource.hardness ?? 0.5) * 92)),
    toughness: clampEquipmentScore(Math.round((resource.hardness ?? 0.5) * 78)),
    ductility: component?.resourceId === "copper" ? 72 : 32,
    brittleness: component?.resourceId === "tin" ? 58 : 34,
    density: densityScore,
    heatResistance: component?.resourceId === "coal" ? 70 : 48,
    corrosionResistance: component?.resourceId === "copper" ? 58 : 42,
    conductivity: component?.resourceId === "copper" ? 88 : 24,
    thermalConductivity: component?.resourceId === "copper" ? 80 : 28,
    magnetism: component?.resourceId === "iron" ? 70 : 0,
    workability: component?.resourceId === "handle" ? 80 : 48,
  };
}

function equipmentStatsForPieces(sourcePieces) {
  const profile = computedWorkpieceProfileForPieces(sourcePieces);
  if (!profile) return null;
  return normalizeEquipmentStats({
    massGrams: Math.round(profile.mass * 1000),
    volumeCm3: Math.round(profile.volumeM3 * 1_000_000),
    densityKgM3: Math.round(profile.densityKgM3),
    attributes: profile.attributes ?? equipmentAttributesForComponents(profile.components),
  });
}

function normalizeEquipmentStats(stats = null) {
  if (!stats) return null;
  const massGrams = clampInteger(stats.massGrams ?? Math.round((Number(stats.massKg) || 0) * 1000), 0, 0x3fffff);
  const volumeCm3 = clampInteger(stats.volumeCm3 ?? Math.round((Number(stats.volumeM3) || 0) * 1_000_000), 0, 0x3fffff);
  const densityKgM3 = clampInteger(stats.densityKgM3, 0, 0x3fff);
  const attributes = {};
  for (const key of SMELTING_MATERIAL_ATTRIBUTE_KEYS) {
    attributes[key] = clampEquipmentScore(stats.attributes?.[key] ?? 0);
  }
  return {
    massGrams,
    volumeCm3,
    densityKgM3,
    attributes,
    massKg: roundPhysicalValue(massGrams / 1000, 4),
    volumeM3: roundPhysicalValue(volumeCm3 / 1_000_000, 8),
  };
}

function clampEquipmentScore(value) {
  return clampInteger(value, 0, 100);
}

function clampInteger(value, min, max) {
  const numeric = Math.round(Number(value) || 0);
  return Math.max(min, Math.min(max, numeric));
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
        paint: clonePaintRecords(component.paint),
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
  const walkSwing = Math.sin(elapsed * 8.4) * 0.36;
  const armSwing = avatarMovement.movingHorizontal ? walkSwing * 0.52 : idleSwing;
  const legSwing = avatarMovement.movingHorizontal ? walkSwing : idleSwing * 0.45;
  const { leftArm, rightArm, leftLeg, rightLeg, head } = forgeAvatar.userData.limbs;
  leftArm.rotation.x = armSwing;
  rightArm.rotation.z = 0;
  rightArm.rotation.x = -armSwing;
  leftLeg.rotation.x = -legSwing;
  rightLeg.rotation.x = legSwing;
  head.rotation.x = Math.sin(elapsed * 0.7) * 0.035;
  head.rotation.y = Math.sin(elapsed * 0.5) * 0.025;
  if (avatarMovement.movingHorizontal) faceForgeAvatarToDirection(avatarMovement.direction);
  else faceForgeAvatarToBench();
}

function faceForgeAvatarToBench() {
  const direction = new THREE.Vector3(0, 0, 0).sub(forgeAvatar.position);
  direction.y = 0;
  faceForgeAvatarToDirection(direction);
}

function faceForgeAvatarToDirection(direction) {
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
    if (tool === "drill" && setting === "profile") toolSettings.drill.profile = value;
    if (tool === "drill" && setting === "depth") toolSettings.drill.depth = value;
    if (tool === "drill" && setting === "direction") toolSettings.drill.direction = value;
    if (tool === "saw" && setting === "angle") toolSettings.saw.angle = Number(value);
    if (tool === "saw" && setting === "mode") toolSettings.saw.mode = value;
    if (tool === "saw" && setting === "side") toolSettings.saw.side = value;
    if (tool === "saw" && setting === "depth") toolSettings.saw.depth = value;
    if (tool === "paint" && setting === "size") toolSettings.paint.size = Number(value);
    if (tool === "paint" && setting === "color") {
      toolSettings.paint.color = validColorValue(value) ? value : toolSettings.paint.color;
      toolSettings.paint.mode = "paint";
    }
    if (tool === "paint" && setting === "mode") toolSettings.paint.mode = value;
    renderToolSettingsMenu();
    updateHoveredFace();
  });
  menu.addEventListener("input", (event) => {
    const input = event.target.closest("input[data-setting]");
    if (!input) return;
    if (input.dataset.tool === "paint" && input.dataset.setting === "color" && validColorValue(input.value)) {
      toolSettings.paint.color = input.value;
      toolSettings.paint.mode = "paint";
      renderToolSettingsMenu();
      updateHoveredFace();
    }
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
  const activeTool = sawEnabled ? "saw" : drillEnabled ? "drill" : paintEnabled ? "paint" : null;
  if (!activeTool) {
    toolSettingsMenu.replaceChildren();
    return;
  }

  const title = document.createElement("strong");
  const sections = [title];
  if (activeTool === "paint") {
    title.textContent = t("forging.toolMenu.paintTitle");
    sections.push(createPaintPaletteSection());
    sections.push(createMenuSection(
      t("forging.toolMenu.brushSize"),
      toolSizeOptions(),
      "paint",
      "size",
      String(toolSettings.paint.size),
    ));
    sections.push(createMenuSection(
      t("forging.toolMenu.paintMode"),
      paintModeOptions(),
      "paint",
      "mode",
      toolSettings.paint.mode,
    ));
    sections.push(createPaintCustomColorSection());
  } else if (activeTool === "saw") {
    title.textContent = t("forging.toolMenu.sawTitle");
    sections.push(createMenuSection(
      t("forging.toolMenu.cutMode"),
      sawModeOptions(),
      "saw",
      "mode",
      toolSettings.saw.mode,
    ));
    sections.push(createMenuSection(
      t("forging.toolMenu.angle"),
      toolAngleOptions(),
      "saw",
      "angle",
      String(toolSettings.saw.angle),
    ));
    sections.push(createMenuSection(
      t("forging.toolMenu.direction"),
      toolSideOptions(),
      "saw",
      "side",
      toolSettings.saw.side,
    ));
    sections.push(createMenuSection(
      t("forging.toolMenu.depth"),
      drillDepthOptions(),
      "saw",
      "depth",
      toolSettings.saw.depth,
    ));
  } else {
    title.textContent = t("forging.toolMenu.drillTitle");
    sections.push(createMenuSection(
      t("forging.toolMenu.profile"),
      drillProfileOptions(),
      "drill",
      "profile",
      toolSettings.drill.profile,
    ));
    sections.push(createMenuSection(
      t("forging.toolMenu.size"),
      toolSizeOptions(),
      "drill",
      "size",
      String(toolSettings.drill.size),
    ));
    sections.push(createMenuSection(
      t("forging.toolMenu.depth"),
      drillDepthOptions(),
      "drill",
      "depth",
      toolSettings.drill.depth,
    ));
    sections.push(createMenuSection(
      t("forging.toolMenu.direction"),
      drillDirectionOptions(),
      "drill",
      "direction",
      toolSettings.drill.direction,
    ));
  }
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

function createPaintPaletteSection() {
  const section = document.createElement("section");
  const heading = document.createElement("span");
  heading.textContent = t("forging.toolMenu.palette");
  const row = document.createElement("div");
  row.className = "tool-settings-row paint-palette-row";
  for (const color of paintPaletteColors()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "paint-swatch";
    button.dataset.tool = "paint";
    button.dataset.setting = "color";
    button.dataset.value = color;
    button.style.setProperty("--paint-color", color);
    button.classList.toggle("active", toolSettings.paint.mode === "paint" && quantizedColorValue(toolSettings.paint.color) === quantizedColorValue(color));
    button.setAttribute("aria-label", t("forging.toolMenu.paletteColor"));
    button.setAttribute("aria-pressed", String(button.classList.contains("active")));
    row.append(button);
  }
  section.append(heading, row);
  return section;
}

function createPaintCustomColorSection() {
  const section = document.createElement("section");
  const heading = document.createElement("span");
  heading.textContent = t("forging.toolMenu.customColor");
  const input = document.createElement("input");
  input.type = "color";
  input.dataset.tool = "paint";
  input.dataset.setting = "color";
  input.value = validColorValue(toolSettings.paint.color) ? toolSettings.paint.color : "#f0c86a";
  input.setAttribute("aria-label", t("forging.toolMenu.customColor"));
  section.append(heading, input);
  return section;
}

function paintPaletteColors() {
  return [
    "#f0c86a",
    "#e8584f",
    "#4bd6c8",
    "#5d8cff",
    "#7bd66f",
    "#f4f1df",
    "#202020",
    "#b96d45",
    "#9ca4a2",
    "#7b5438",
    "#a85cff",
    "#ff8cc6",
  ];
}

function toolSizeOptions() {
  return [
    ["1", t("forging.toolMenu.sizeSmall")],
    ["3", t("forging.toolMenu.sizeMedium")],
    ["5", t("forging.toolMenu.sizeLarge")],
  ];
}

function paintModeOptions() {
  return [
    ["paint", t("forging.toolMenu.paintModeDraw")],
    ["erase", t("forging.toolMenu.paintModeErase")],
  ];
}

function sawModeOptions() {
  return [
    ["kerf", t("forging.toolMenu.cutKerf")],
    ["trim", t("forging.toolMenu.cutTrim")],
  ];
}

function toolAngleOptions() {
  return [0, 30, 45, 60, 90, 120, 150].map((value) => [String(value), t("forging.toolMenu.angleValue", { value })]);
}

function toolSideOptions() {
  return [
    ["auto", t("forging.toolMenu.directionAuto")],
    ["a", t("forging.toolMenu.directionA")],
    ["b", t("forging.toolMenu.directionB")],
  ];
}

function drillProfileOptions() {
  return [
    ["round", t("forging.toolMenu.profileRound")],
    ["square", t("forging.toolMenu.profileSquare")],
    ["slot", t("forging.toolMenu.profileSlot")],
  ];
}

function drillDepthOptions() {
  return [
    ["through", t("forging.toolMenu.depthThrough")],
    ["half", t("forging.toolMenu.depthHalf")],
    ["shallow", t("forging.toolMenu.depthShallow")],
  ];
}

function drillDirectionOptions() {
  return [
    ["a", t("forging.toolMenu.directionA")],
    ["b", t("forging.toolMenu.directionB")],
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
      <span class="tool-icon" aria-hidden="true">${toolIconSvg(tool.id)}</span>
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
  } else if (selectedTool === "paintBrush") {
    setStatus("forging.status.paintReady");
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
  paintEnabled = selectedTool === "paintBrush";
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
  if (!paintEnabled) paintPointerId = null;
  if (!sawEnabled) saw.visible = false;
  if (!drillEnabled) handDrill.visible = false;
  if (!gripEnabled) gripHand.visible = false;
  if (!hammerEnabled) {
    strike = null;
    hammer.visible = false;
  }
  if (!sawEnabled && !drillEnabled && !paintEnabled) {
    hideToolSettingsMenu();
  } else if (!toolSettingsMenu.hidden) {
    renderToolSettingsMenu();
  }
  if (!hammerEnabled && !gripEnabled && !paintEnabled) {
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
  if (!pieces.length || (!hammerEnabled && !sawEnabled && !drillEnabled && !gripEnabled && !paintEnabled) || activeDrag) {
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
  if (paintEnabled) {
    const paintSurface = paintSurfaceFromTarget(target);
    if (!paintSurface) {
      faceMarker.visible = false;
      return;
    }
    const marker = buildPaintMarkerGeometry(paintSurface);
    faceMarker.visible = true;
    faceMarker.position.copy(piece.mesh.position);
    faceMarker.rotation.set(0, 0, 0);
    faceMarker.scale.set(1, 1, 1);
    setPaintMarkerStyle();
    setFaceMarkerGeometry(marker.surface, marker.lines);
    return;
  }
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

function setPaintMarkerStyle() {
  const color = new THREE.Color(toolSettings.paint.color);
  faceMarkerSurface.material.color.copy(color);
  faceMarkerSurface.material.opacity = toolSettings.paint.mode === "erase" ? 0.18 : 0.34;
  faceMarkerLines.material.color.copy(toolSettings.paint.mode === "erase" ? new THREE.Color(0xffffff) : color);
}

function paintFromPointer() {
  if (!paintEnabled || !pieces.length) return false;
  const target = toolTargetFromPointer({ allowSelectedFallback: false, preferSelected: true });
  const surface = paintSurfaceFromTarget(target);
  if (!surface) {
    setStatus("forging.status.miss");
    return false;
  }
  const changed = paintSurfaceCells(surface);
  if (!changed) return true;
  refreshPieceGeometry(surface.piece);
  updatePiece(surface.piece);
  updateHud();
  invalidateCurrentChainCode();
  setStatus(toolSettings.paint.mode === "erase" ? "forging.status.paintErased" : "forging.status.paintApplied");
  return true;
}

function paintSurfaceFromTarget(target) {
  if (!target?.piece || !target.localPoint || !target.normal) return null;
  return target.piece.components
    ? compoundPaintSurfaceForLocalPoint(target.piece, target.localPoint, target.normal)
    : singlePaintSurfaceForLocalPoint(target.piece, target.localPoint, target.normal);
}

function singlePaintSurfaceForLocalPoint(piece, localPoint, normal) {
  if (piece.appearance) return null;
  const cell = surfaceCellFromLocalPoint(piece, localPoint, normal);
  if (!cell || !isExposedSurfaceCell(piece, cell, normal)) return null;
  return {
    piece,
    component: piece,
    proxy: piece,
    cell,
    normal: normal.clone(),
    componentOffset: new THREE.Vector3(),
  };
}

function compoundPaintSurfaceForLocalPoint(piece, localPoint, normal) {
  if (!piece?.components?.length) return null;
  const normalAxis = dominantAxis(normal);
  const tangentAxes = [0, 1, 2].filter((axis) => axis !== normalAxis);
  let best = null;
  let bestScore = Infinity;
  for (const component of piece.components) {
    const proxy = componentGripProxy(component);
    const componentOffset = component.offset ?? new THREE.Vector3();
    const componentLocalPoint = localPoint.clone().sub(componentOffset);
    if (!componentLocalPointNearGripSurface(componentLocalPoint, proxy, normal)) continue;
    const cell = surfaceCellFromLocalPoint(proxy, componentLocalPoint, normal);
    if (!cell || !isExposedSurfaceCell(proxy, cell, normal)) continue;
    const surfacePoint = surfacePointForCell(proxy, cell, normal, componentLocalPoint).add(componentOffset);
    const da = surfacePoint.getComponent(tangentAxes[0]) - localPoint.getComponent(tangentAxes[0]);
    const db = surfacePoint.getComponent(tangentAxes[1]) - localPoint.getComponent(tangentAxes[1]);
    const dn = surfacePoint.getComponent(normalAxis) - localPoint.getComponent(normalAxis);
    const score = da * da + db * db + dn * dn * 0.25;
    if (score >= bestScore) continue;
    bestScore = score;
    best = {
      piece,
      component,
      proxy,
      cell,
      normal: normal.clone(),
      componentOffset: componentOffset.clone(),
    };
  }
  return best;
}

function paintSurfaceCells(surface) {
  const axis = dominantAxis(surface.normal);
  const side = Math.sign(surface.normal.getComponent(axis)) > 0 ? 1 : 0;
  const tangentAxes = [0, 1, 2].filter((item) => item !== axis);
  const half = Math.floor((Number(toolSettings.paint.size) || 1) / 2);
  const colorValue = quantizedColorValue(toolSettings.paint.color);
  let changed = false;
  for (let da = -half; da <= half; da++) {
    for (let db = -half; db <= half; db++) {
      const cell = [...surface.cell];
      cell[tangentAxes[0]] += da;
      cell[tangentAxes[1]] += db;
      if (!isExposedPaintCell(surface.component, cell, axis, side)) continue;
      changed = setPaintRecord(surface.component, cell, axis, side, colorValue, toolSettings.paint.mode) || changed;
    }
  }
  return changed;
}

function isExposedPaintCell(component, cell, axis, side) {
  if (!isComponentSolid(component, cell[0], cell[1], cell[2])) return false;
  const neighbor = [...cell];
  neighbor[axis] += side ? 1 : -1;
  return !isComponentSolid(component, neighbor[0], neighbor[1], neighbor[2]);
}

function setPaintRecord(component, cell, axis, side, colorValue, mode = "paint") {
  const paint = component.paint ?? [];
  const key = paintFaceKey(axis, side, cell);
  const index = paint.findIndex((record) => paintFaceKey(record.axis, record.side, [record.x, record.y, record.z]) === key);
  const baseColorValue = quantizedColorValue(component.color ?? resources[component.resourceId]?.color ?? resources.iron.color);
  if (mode === "erase" || colorValue === baseColorValue) {
    if (index < 0) return false;
    paint.splice(index, 1);
    component.paint = paint;
    return true;
  }
  const nextRecord = {
    axis,
    side,
    x: cell[0],
    y: cell[1],
    z: cell[2],
    color: colorStringFromQuantized(colorValue),
  };
  if (index >= 0) {
    if (quantizedColorValue(paint[index].color) === colorValue) return false;
    paint[index] = nextRecord;
  } else {
    paint.push(nextRecord);
  }
  component.paint = paint;
  return true;
}

function buildPaintMarkerGeometry(surface) {
  const surfacePositions = [];
  const linePositions = [];
  const axis = dominantAxis(surface.normal);
  const side = Math.sign(surface.normal.getComponent(axis)) > 0 ? 1 : 0;
  const tangentAxes = [0, 1, 2].filter((item) => item !== axis);
  const half = Math.floor((Number(toolSettings.paint.size) || 1) / 2);
  for (let da = -half; da <= half; da++) {
    for (let db = -half; db <= half; db++) {
      const cell = [...surface.cell];
      cell[tangentAxes[0]] += da;
      cell[tangentAxes[1]] += db;
      if (!isExposedPaintCell(surface.component, cell, axis, side)) continue;
      const corners = cellFaceCorners(surface.proxy, cell, surface.normal, 0.009)
        .map((corner) => translateCoordinate(corner, surface.componentOffset));
      pushFace(surfacePositions, [], corners, [surface.normal.x, surface.normal.y, surface.normal.z]);
      pushLineLoop(linePositions, corners);
    }
  }
  return { surface: surfacePositions, lines: linePositions };
}

function translateCoordinate(coordinate, offset) {
  return [
    coordinate[0] + (offset?.x ?? 0),
    coordinate[1] + (offset?.y ?? 0),
    coordinate[2] + (offset?.z ?? 0),
  ];
}

function invalidateCurrentChainCode() {
  currentChainCode = "";
  chainCodeOutput.value = "";
  markEquipmentPreviewDirty();
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
  const centerForAxis = (value, min, max, footprint) => {
    const size = max - min;
    if (!Number.isFinite(size) || size <= 0) return value;
    if (size <= footprint) return (min + max) * 0.5;
    return THREE.MathUtils.clamp(value, min + footprint * 0.5, max - footprint * 0.5);
  };
  coordinate[region.axes[0]] = centerForAxis(
    coordinate[region.axes[0]],
    region.minA,
    region.maxA,
    footprintA,
  );
  coordinate[region.axes[1]] = centerForAxis(
    coordinate[region.axes[1]],
    region.minB,
    region.maxB,
    footprintB,
  );
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
    const centeredPoint = gripLocalPointForRegion(
      componentGrip.localPoint,
      piece.gripNormal,
      componentGrip.region,
      avatarHandGripFootprint.x,
      avatarHandGripFootprint.y,
    );
    if (!centeredPoint.equals(piece.gripOffset)) piece.gripOffset.copy(centeredPoint);
    marker = buildCompoundGripPlacementMarkerGeometry(
      componentGrip,
      centeredPoint,
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
  const center = tangentAxes.map((axis) => hitCell[axis]);
  const mode = toolSettings.saw.mode;
  const side = resolveSawSide(piece, normalAxis, tangentAxes, hitCell[normalAxis], center, toolSettings.saw.angle, toolSettings.saw.side);
  const surface = [];
  const lines = [];
  const angle = toolSettings.saw.angle;

  for (let a = 0; a < piece.grid[axisKey(tangentAxes[0])]; a++) {
    for (let b = 0; b < piece.grid[axisKey(tangentAxes[1])]; b++) {
      const cell = [...hitCell];
      cell[tangentAxes[0]] = a;
      cell[tangentAxes[1]] = b;
      if (!sawCellMatches(cell, center, tangentAxes, angle, mode, side) || !isExposedSurfaceCell(piece, cell, normal)) continue;
      if (mode === "trim") {
        const corners = cellFaceCorners(piece, cell, normal, 0.009);
        pushFace(surface, [], corners, [normal.x, normal.y, normal.z]);
        pushLineLoop(lines, corners);
      } else {
        const segment = angledCellLineSegment(piece, cell, normal, tangentAxes, angle, 0.008);
        pushLine(lines, segment.start, segment.end);
      }
    }
  }
  return surface.length || lines.length ? { surface, lines } : buildFaceCellMarkerGeometry(piece, hitCell, normal);
}

function buildDrillMarkerGeometry(piece, hitCell, normal) {
  const normalAxis = dominantAxis(normal);
  const tangentAxes = [0, 1, 2].filter((axis) => axis !== normalAxis);
  const surface = [];
  const lines = [];
  const center = tangentAxes.map((axis) => hitCell[axis]);
  const bounds = drillProfileBounds(toolSettings.drill.size, toolSettings.drill.profile, toolSettings.drill.direction);
  for (let a = center[0] - bounds[0]; a <= center[0] + bounds[0]; a++) {
    for (let b = center[1] - bounds[1]; b <= center[1] + bounds[1]; b++) {
      const cell = [...hitCell];
      cell[tangentAxes[0]] = a;
      cell[tangentAxes[1]] = b;
      if (!drillCellInProfile(a, b, center, toolSettings.drill.size, toolSettings.drill.profile, toolSettings.drill.direction)) continue;
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
  if (piece.components || piece.appearance) {
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
  const center = tangentAxes.map((axis) => localCoordinateToVoxel(piece, axis, localPoint.getComponent(axis)));
  const firstLayer = depthToVoxelLayer(piece, normalAxis, normal.getComponent(normalAxis), 0);
  const side = resolveSawSide(piece, normalAxis, tangentAxes, firstLayer, center, toolSettings.saw.angle, toolSettings.saw.side);
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
    center,
    angle: toolSettings.saw.angle,
    mode: toolSettings.saw.mode,
    side,
    maxDepth: drillMaxDepth(piece, normalAxis, toolSettings.saw.depth),
    done: false,
  };
}

function createDrillAction(piece, point, localPoint, normal) {
  const normalAxis = dominantAxis(normal);
  const tangentAxes = [0, 1, 2].filter((axis) => axis !== normalAxis);
  const maxDepth = drillMaxDepth(piece, normalAxis, toolSettings.drill.depth);
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
    profile: toolSettings.drill.profile,
    depthMode: toolSettings.drill.depth,
    direction: toolSettings.drill.direction,
    maxDepth,
    done: false,
  };
}

function applyShapeToolStep(action) {
  if (!action || action.done) return;
  action.depth += 1;
  const maxDepth = action.maxDepth ?? action.piece.grid[axisKey(action.normalAxis)];
  if (action.depth >= maxDepth) {
    action.done = true;
    setStatus(shapeToolCompleteStatus(action));
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
      setStatus(shapeToolCompleteStatus(action));
    } else {
      setStatus(action.type === "saw" ? "forging.status.sawCut" : "forging.status.drillCut");
    }
  } else if (action.depth >= maxDepth - 1) {
    action.done = true;
    setStatus(shapeToolCompleteStatus(action));
  }
}

function shapeToolCompleteStatus(action) {
  if (action.type === "saw") return "forging.status.sawComplete";
  return action.depthMode === "through" ? "forging.status.drillThrough" : "forging.status.drillPocket";
}

function finishShapeToolAction() {
  if (!toolAction) return;
  const action = toolAction;
  toolAction = null;
  saw.visible = false;
  handDrill.visible = false;
  if (!action.modified || !action.piece || action.piece.components) return;

  const result = rebuildPieceFromSolidIslands(action.piece);
  if (result === "removed") {
    setStatus("forging.status.pieceRemoved");
    updateHud();
    return;
  }
  if (result === "rebuilt" || result === "split") {
    if (selectedTool !== "gloves") settleAllPieces();
    setStatus(result === "split" ? "forging.status.shapeSplit" : "forging.status.shapeSettled");
  }
}

function rebuildPieceFromSolidIslands(piece) {
  const islands = solidIslands(piece);
  if (!islands.length) {
    removePiece(piece);
    return "removed";
  }

  const totalSolid = piece.solidCells?.length ?? solidCellsFor(piece).length;
  if (islands.length === 1 && islands[0].cells.length === totalSolid && islands[0].fillsGrid) return "unchanged";

  const source = splitSourceSnapshot(piece);
  islands.forEach((island, index) => {
    const targetPiece = index === 0 ? piece : createSplitPieceShell(source);
    rebuildPieceAsIsland(targetPiece, source, island);
    if (index > 0) addSplitPieceToWorkbench(targetPiece);
  });
  selectPiece(piece);
  syncUsedBackpackMaterialEntriesFromWorkbench();
  updateHud();
  return islands.length > 1 ? "split" : "rebuilt";
}

function splitSourceSnapshot(piece) {
  return {
    resourceId: piece.resourceId,
    materialIds: [...(piece.materialIds ?? [])],
    backpackMaterialEntryKey: piece.backpackMaterialEntryKey ?? null,
    backpackMaterialEntryKeys: [...(piece.backpackMaterialEntryKeys ?? [])],
    role: piece.role,
    color: piece.color?.clone?.() ?? new THREE.Color(resources[piece.resourceId]?.color ?? resources.iron.color),
    heat: piece.heat,
    densityKgM3: piece.densityKgM3,
    hardness: piece.hardness,
    oldGrid: { ...piece.grid },
    oldDims: piece.dims.clone(),
    oldOffset: piece.offset.clone(),
    paint: clonePaintRecords(piece.paint),
    gripOffset: piece.gripOffset?.clone?.() ?? null,
    gripNormal: piece.gripNormal?.clone?.() ?? null,
    gripAngle: piece.gripAngle ?? 0,
  };
}

function createSplitPieceShell(source) {
  const material = workMaterial.clone();
  material.color.copy(source.color);
  const mesh = new THREE.Mesh(emptyGeometry.clone(), material);
  const edges = new THREE.LineSegments(
    emptyGeometry.clone(),
    new THREE.LineBasicMaterial({ color: 0xffe0a1, transparent: true, opacity: 0.55 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.pieceId = nextPieceId;
  edges.userData.pieceId = nextPieceId;

  return {
    id: nextPieceId++,
    resourceId: source.resourceId,
    materialIds: [...source.materialIds],
    backpackMaterialEntryKey: source.backpackMaterialEntryKey,
    backpackMaterialEntryKeys: [...source.backpackMaterialEntryKeys],
    role: source.role,
    color: source.color.clone(),
    heat: source.heat,
    mass: 0,
    baseMass: 0,
    densityKgM3: source.densityKgM3,
    hardness: source.hardness,
    dims: source.oldDims.clone(),
    offset: source.oldOffset.clone(),
    grid: { ...voxelGrid },
    solid: createSolidVoxels(voxelGrid),
    mesh,
    edges,
  };
}

function rebuildPieceAsIsland(piece, source, island) {
  const oldGrid = source.oldGrid;
  const oldDims = source.oldDims;
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
  piece.paint = paintForIsland(source, islandSet, min, cropCells, nextGrid);
  piece.dims.copy(nextDims);
  piece.offset.copy(source.oldOffset).add(localCenter);
  const gripOffset = gripOffsetForIsland(source, islandSet, localCenter);
  piece.gripOffset = gripOffset;
  piece.gripNormal = gripOffset ? source.gripNormal?.clone?.() ?? null : null;
  piece.gripAngle = gripOffset ? source.gripAngle : 0;
  refreshPieceGeometry(piece);
  updatePiece(piece);
}

function paintForIsland(source, islandSet, min, cropCells, nextGrid) {
  if (!Array.isArray(source.paint) || !source.paint.length) return [];
  const paint = [];
  for (const record of source.paint) {
    const sourceCell = [record.x, record.y, record.z];
    if (!islandSet.has(cellKey(sourceCell))) continue;
    const cell = [
      remapIslandPaintCell(record.x, min[0], cropCells[0], nextGrid.x),
      remapIslandPaintCell(record.y, min[1], cropCells[1], nextGrid.y),
      remapIslandPaintCell(record.z, min[2], cropCells[2], nextGrid.z),
    ];
    paint.push({
      axis: record.axis,
      side: record.side,
      x: cell[0],
      y: cell[1],
      z: cell[2],
      color: colorStringFromQuantized(quantizedColorValue(record.color)),
    });
  }
  return paint;
}

function remapIslandPaintCell(value, min, cropSize, nextSize) {
  const normalized = (value - min + 0.5) / cropSize;
  return THREE.MathUtils.clamp(Math.floor(normalized * nextSize), 0, nextSize - 1);
}

function addSplitPieceToWorkbench(piece) {
  pieces.push(piece);
  selectableMeshes.push(piece.mesh);
  scene.add(piece.mesh, piece.edges);
  updatePiece(piece);
}

function gripOffsetForIsland(source, islandSet, localCenter) {
  if (!source.gripOffset || !source.gripNormal) return null;
  const cell = [0, 0, 0];
  for (let axis = 0; axis < 3; axis++) {
    cell[axis] = localCoordinateToVoxelInGrid(source.oldDims, source.oldGrid, axis, source.gripOffset.getComponent(axis));
  }
  if (!islandSet.has(cellKey(cell))) return null;
  return source.gripOffset.clone().sub(localCenter);
}

function resampleIslandCell(value, min, cropSize, nextSize) {
  const normalized = (value + 0.5) / nextSize;
  return min + THREE.MathUtils.clamp(Math.floor(normalized * cropSize), 0, cropSize - 1);
}

function solidIslands(piece) {
  const cells = piece.solidCells ?? solidCellsFor(piece);
  const solid = new Set(cells.map(cellKey));
  const visited = new Set();
  const islands = [];
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
    islands.push(summarizeSolidIsland(island, piece.grid));
  }
  islands.sort((a, b) => b.cells.length - a.cells.length);
  return islands;
}

function summarizeSolidIsland(cells, grid) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const cell of cells) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], cell[axis]);
      max[axis] = Math.max(max[axis], cell[axis]);
    }
  }
  const fillsGrid = cells.length > 0 &&
    min[0] === 0 && min[1] === 0 && min[2] === 0 &&
    max[0] === grid.x - 1 && max[1] === grid.y - 1 && max[2] === grid.z - 1;
  return { cells, min, max, fillsGrid };
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
  const { piece, normalAxis, tangentAxes, center, angle, mode, side } = action;
  const layer = depthToVoxelLayer(piece, normalAxis, action.normal.getComponent(normalAxis), action.depth);
  let removed = false;
  for (let a = 0; a < piece.grid[axisKey(tangentAxes[0])]; a++) {
    for (let b = 0; b < piece.grid[axisKey(tangentAxes[1])]; b++) {
      const coordinate = [0, 0, 0];
      coordinate[normalAxis] = layer;
      coordinate[tangentAxes[0]] = a;
      coordinate[tangentAxes[1]] = b;
      if (!sawCellMatches(coordinate, center, tangentAxes, angle, mode, side)) continue;
      removed = setSolid(piece, coordinate[0], coordinate[1], coordinate[2], 0) || removed;
    }
  }
  return removed;
}

function sawCellMatches(cell, center, tangentAxes, angleDeg, mode = "kerf", side = "a") {
  const distance = signedSawDistance(cell, center, tangentAxes, angleDeg);
  if (mode === "trim") return side === "b" ? distance <= 0.5 : distance >= -0.5;
  return Math.abs(distance) <= 0.5;
}

function sawCellOnLine(cell, center, tangentAxes, angleDeg) {
  return Math.abs(signedSawDistance(cell, center, tangentAxes, angleDeg)) <= 0.5;
}

function signedSawDistance(cell, center, tangentAxes, angleDeg) {
  const angle = THREE.MathUtils.degToRad(angleDeg);
  const cross = new THREE.Vector2(-Math.sin(angle), Math.cos(angle));
  const centerA = center.length === 2 ? center[0] : center[tangentAxes[0]];
  const centerB = center.length === 2 ? center[1] : center[tangentAxes[1]];
  const delta = new THREE.Vector2(
    cell[tangentAxes[0]] - centerA,
    cell[tangentAxes[1]] - centerB,
  );
  return delta.dot(cross);
}

function resolveSawSide(piece, normalAxis, tangentAxes, layer, center, angle, requestedSide) {
  if (requestedSide === "a" || requestedSide === "b") return requestedSide;
  const counts = { a: 0, b: 0 };
  for (let a = 0; a < piece.grid[axisKey(tangentAxes[0])]; a++) {
    for (let b = 0; b < piece.grid[axisKey(tangentAxes[1])]; b++) {
      const coordinate = [0, 0, 0];
      coordinate[normalAxis] = layer;
      coordinate[tangentAxes[0]] = a;
      coordinate[tangentAxes[1]] = b;
      if (!isSolid(piece, coordinate[0], coordinate[1], coordinate[2])) continue;
      const distance = signedSawDistance(coordinate, center, tangentAxes, angle);
      if (distance > 0.5) counts.a += 1;
      else if (distance < -0.5) counts.b += 1;
    }
  }
  if (counts.a === counts.b) return center[0] >= piece.grid[axisKey(tangentAxes[0])] * 0.5 ? "a" : "b";
  return counts.a <= counts.b ? "a" : "b";
}

function removeDrillLayer(action) {
  const { piece, normalAxis, tangentAxes, center, size, profile, direction } = action;
  const layer = depthToVoxelLayer(piece, normalAxis, action.normal.getComponent(normalAxis), action.depth);
  let removed = false;
  const bounds = drillProfileBounds(size, profile, direction);
  for (let a = center[0] - bounds[0]; a <= center[0] + bounds[0]; a++) {
    for (let b = center[1] - bounds[1]; b <= center[1] + bounds[1]; b++) {
      if (!drillCellInProfile(a, b, center, size, profile, direction)) continue;
      const coordinate = [0, 0, 0];
      coordinate[normalAxis] = layer;
      coordinate[tangentAxes[0]] = a;
      coordinate[tangentAxes[1]] = b;
      removed = setSolid(piece, coordinate[0], coordinate[1], coordinate[2], 0) || removed;
    }
  }
  return removed;
}

function drillMaxDepth(piece, normalAxis, depthMode) {
  const fullDepth = piece.grid[axisKey(normalAxis)];
  if (depthMode === "shallow") return Math.max(1, Math.ceil(fullDepth * 0.25));
  if (depthMode === "half") return Math.max(1, Math.ceil(fullDepth * 0.5));
  return fullDepth;
}

function drillProfileBounds(size, profile = "round", direction = "a") {
  const half = Math.floor(Number(size) / 2);
  if (profile !== "slot") return [half, half];
  const longHalf = size <= 1 ? 0 : half + 1;
  const shortHalf = size >= 5 ? 1 : 0;
  return direction === "b" ? [shortHalf, longHalf] : [longHalf, shortHalf];
}

function drillCellInProfile(a, b, center, size, profile = "round", direction = "a") {
  const da = a - center[0];
  const db = b - center[1];
  if (profile === "square") {
    const half = Math.floor(Number(size) / 2);
    return Math.abs(da) <= half && Math.abs(db) <= half;
  }
  if (profile === "slot") {
    const [boundA, boundB] = drillProfileBounds(size, profile, direction);
    return Math.abs(da) <= boundA && Math.abs(db) <= boundB;
  }
  const radius = Math.floor(Number(size) / 2) + 0.12;
  return da * da + db * db <= radius * radius;
}

function localCoordinateToVoxel(piece, axis, value) {
  return localCoordinateToVoxelInGrid(piece.dims, piece.grid, axis, value);
}

function localCoordinateToVoxelInGrid(dims, grid, axis, value) {
  const key = axisKey(axis);
  const size = dims.getComponent(axis);
  const normalized = (value + size * 0.5) / size;
  return THREE.MathUtils.clamp(Math.floor(normalized * grid[key]), 0, grid[key] - 1);
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
  if (key.startsWith("forging.status.chain")) {
    setChainActionStatus(key, chainStatusTone(key));
  }
}

function setChainActionStatus(key, tone = "neutral") {
  if (!chainActionStatus) return;
  chainActionStatus.dataset.statusKey = key;
  chainActionStatus.dataset.tone = tone;
  chainActionStatus.textContent = t(key);
}

function chainStatusTone(key) {
  if (key === "forging.status.chainSubmitted") return "success";
  if (key === "forging.status.chainSubmitting") return "pending";
  if (key === "forging.status.chainSaved" || key === "forging.status.chainCopied") return "neutral";
  return "error";
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
  updateForgeAvatarMovement(dt);
  updateForgeAvatar();
  updateGripFailureAnimations(dt);
  updateGripCollisionAttemptAnimations(dt);
  updateGripCollisionFlashAnimations(dt);
  updateAvatarCollisionProbeFlashAnimations(dt);
  updateAvatarCollisionPartFlashAnimations(dt);
  renderer.render(scene, camera);
}
