var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// ../../../../board_game_service/BoardSmith/packages/engine/dist/element/element-collection.js
var ElementCollection;
var init_element_collection = __esm({
  "../../../../board_game_service/BoardSmith/packages/engine/dist/element/element-collection.js"() {
    "use strict";
    ElementCollection = class _ElementCollection extends Array {
      /**
       * Override slice to return ElementCollection
       */
      slice(...args) {
        return super.slice(...args);
      }
      /**
       * Override filter to return ElementCollection
       */
      filter(predicate) {
        return super.filter(predicate);
      }
      all(classNameOrFinder, ...finders) {
        if (this.isElementClass(classNameOrFinder)) {
          return this._finder(classNameOrFinder, {}, ...finders);
        }
        if (classNameOrFinder !== void 0) {
          finders = [classNameOrFinder, ...finders];
        }
        return this._finder(void 0, {}, ...finders);
      }
      first(classNameOrFinder, ...finders) {
        if (this.isElementClass(classNameOrFinder)) {
          return this._finder(classNameOrFinder, { limit: 1 }, ...finders)[0];
        }
        if (classNameOrFinder !== void 0) {
          finders = [classNameOrFinder, ...finders];
        }
        return this._finder(void 0, { limit: 1 }, ...finders)[0];
      }
      firstN(n, classNameOrFinder, ...finders) {
        if (this.isElementClass(classNameOrFinder)) {
          return this._finder(classNameOrFinder, { limit: n }, ...finders);
        }
        if (classNameOrFinder !== void 0) {
          finders = [classNameOrFinder, ...finders];
        }
        return this._finder(void 0, { limit: n }, ...finders);
      }
      last(classNameOrFinder, ...finders) {
        if (this.isElementClass(classNameOrFinder)) {
          return this._finder(classNameOrFinder, { limit: 1, order: "desc" }, ...finders)[0];
        }
        if (classNameOrFinder !== void 0) {
          finders = [classNameOrFinder, ...finders];
        }
        return this._finder(void 0, { limit: 1, order: "desc" }, ...finders)[0];
      }
      lastN(n, classNameOrFinder, ...finders) {
        if (this.isElementClass(classNameOrFinder)) {
          return this._finder(classNameOrFinder, { limit: n, order: "desc" }, ...finders);
        }
        if (classNameOrFinder !== void 0) {
          finders = [classNameOrFinder, ...finders];
        }
        return this._finder(void 0, { limit: n, order: "desc" }, ...finders);
      }
      has(classNameOrFinder, ...finders) {
        return this.first(classNameOrFinder, ...finders) !== void 0;
      }
      /**
       * Sort elements by a property or function
       */
      sortBy(key, direction = "asc") {
        const sorted = new _ElementCollection(...this);
        sorted.sort((a, b) => {
          const aVal = typeof key === "function" ? key(a) : a[key];
          const bVal = typeof key === "function" ? key(b) : b[key];
          if (aVal < bVal)
            return direction === "asc" ? -1 : 1;
          if (aVal > bVal)
            return direction === "asc" ? 1 : -1;
          return 0;
        });
        return sorted;
      }
      /**
       * Get the sum of a numeric property
       */
      sum(key) {
        return this.reduce((acc, el) => {
          const val = typeof key === "function" ? key(el) : el[key];
          return acc + (typeof val === "number" ? val : 0);
        }, 0);
      }
      /**
       * Get the minimum value of a property
       */
      min(key) {
        if (this.length === 0)
          return void 0;
        return this.reduce((min, el) => {
          const minVal = typeof key === "function" ? key(min) : min[key];
          const elVal = typeof key === "function" ? key(el) : el[key];
          return elVal < minVal ? el : min;
        });
      }
      /**
       * Get the maximum value of a property
       */
      max(key) {
        if (this.length === 0)
          return void 0;
        return this.reduce((max, el) => {
          const maxVal = typeof key === "function" ? key(max) : max[key];
          const elVal = typeof key === "function" ? key(el) : el[key];
          return elVal > maxVal ? el : max;
        });
      }
      /**
       * Shuffle the collection in place using the provided random function
       */
      shuffle(random = Math.random) {
        for (let i = this.length - 1; i > 0; i--) {
          const j = Math.floor(random() * (i + 1));
          [this[i], this[j]] = [this[j], this[i]];
        }
        return this;
      }
      /**
       * Get unique values of a property
       */
      unique(key) {
        const seen = /* @__PURE__ */ new Set();
        for (const el of this) {
          seen.add(el[key]);
        }
        return Array.from(seen);
      }
      /**
       * Internal finder implementation
       */
      _finder(className, options, ...finders) {
        const result = new _ElementCollection();
        if (options.limit !== void 0 && options.limit <= 0)
          return result;
        const predicates = finders.map((finder) => this.finderToPredicate(finder));
        const process = (elements, order) => {
          const items = order === "desc" ? [...elements].reverse() : elements;
          for (const el of items) {
            if (options.limit !== void 0 && result.length >= options.limit)
              break;
            const matchesClass = !className || el instanceof className;
            const matchesPredicates = predicates.every((pred) => pred(el));
            if (matchesClass && matchesPredicates) {
              if (order === "desc") {
                result.unshift(el);
              } else {
                result.push(el);
              }
            }
            if (!options.noRecursive && el._t.children.length > 0) {
              const childCollection = new _ElementCollection(...el._t.children);
              const remaining = options.limit !== void 0 ? options.limit - result.length : void 0;
              const childResults = childCollection._finder(className, {
                ...options,
                limit: remaining
              }, ...finders);
              result.push(...childResults);
            }
          }
        };
        process(this, options.order ?? "asc");
        return result;
      }
      /**
       * Convert an ElementFinder to a predicate function
       */
      finderToPredicate(finder) {
        if (typeof finder === "string") {
          return (el) => el.name === finder;
        }
        if (typeof finder === "function") {
          return finder;
        }
        return (el) => {
          for (const [key, value] of Object.entries(finder)) {
            if (key === "empty") {
              if (value !== el.isEmpty())
                return false;
            } else if (key === "mine") {
              if (value !== el.isMine())
                return false;
            } else {
              if (el[key] !== value)
                return false;
            }
          }
          return true;
        };
      }
      /**
       * Check if a value is an ElementClass
       */
      isElementClass(value) {
        return typeof value === "function" && "isGameElement" in value && value.isGameElement === true;
      }
    };
  }
});

// ../../../../board_game_service/BoardSmith/packages/engine/dist/command/visibility.js
function canPlayerSee(visibility, playerPosition, ownerPosition) {
  if (visibility.exceptPlayers?.includes(playerPosition)) {
    return false;
  }
  if (visibility.addPlayers?.includes(playerPosition)) {
    return true;
  }
  switch (visibility.mode) {
    case "all":
      return true;
    case "owner":
      return ownerPosition !== void 0 && playerPosition === ownerPosition;
    case "hidden":
    case "count-only":
    case "unordered":
      return false;
    default:
      return true;
  }
}
function visibilityFromMode(mode) {
  return {
    mode,
    explicit: true
  };
}
function resolveVisibility(childVisibility, parentVisibility) {
  if (childVisibility?.explicit) {
    return childVisibility;
  }
  if (parentVisibility) {
    return {
      ...parentVisibility,
      explicit: false
      // Mark as inherited
    };
  }
  return DEFAULT_VISIBILITY;
}
var DEFAULT_VISIBILITY;
var init_visibility = __esm({
  "../../../../board_game_service/BoardSmith/packages/engine/dist/command/visibility.js"() {
    "use strict";
    DEFAULT_VISIBILITY = {
      mode: "all",
      explicit: false
    };
  }
});

// ../../../../board_game_service/BoardSmith/packages/engine/dist/element/game-element.js
var GameElement;
var init_game_element = __esm({
  "../../../../board_game_service/BoardSmith/packages/engine/dist/element/game-element.js"() {
    "use strict";
    init_element_collection();
    init_visibility();
    GameElement = class _GameElement {
      /** Element name for identification and queries */
      name;
      /** Player who owns this element (affects "mine" queries and visibility) */
      player;
      /** Row position in grid layout */
      row;
      /** Column position in grid layout */
      column;
      /**
       * Image for single-sided elements (boards, mats, tokens).
       * For multi-sided elements (cards, dice), use $images instead.
       * System property - $ prefix indicates this is for the rendering system.
       */
      $image;
      /**
       * Images for multi-sided elements, keyed by side name.
       * Common keys: 'face', 'back' for cards; 'side1'-'side6' for dice.
       * System property - $ prefix indicates this is for the rendering system.
       */
      $images;
      /** Reference to the root game */
      game;
      /** Shared context for all elements in the tree */
      _ctx;
      /** Internal tree structure */
      _t;
      /** Visibility state for this element */
      _visibility;
      /** Static flag to identify GameElement classes */
      static isGameElement = true;
      /** Attributes that should not be serialized */
      static unserializableAttributes = ["_ctx", "_t", "game", "_visibility"];
      /** Attributes visible to all players (undefined = all visible) */
      static visibleAttributes;
      constructor(ctx) {
        this._ctx = ctx;
        if (this._ctx.sequence === void 0) {
          this._ctx.sequence = 0;
        }
        if (!this._ctx.classRegistry) {
          this._ctx.classRegistry = /* @__PURE__ */ new Map();
        }
        const id = this._ctx.sequence++;
        this._t = {
          children: [],
          id,
          order: "normal"
        };
      }
      /**
       * String representation of the element
       */
      toString() {
        return this.name ?? this.constructor.name.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
      }
      // ============================================
      // Tree Structure
      // ============================================
      /**
       * Get the parent element
       */
      get parent() {
        return this._t.parent;
      }
      /**
       * Get all direct children
       */
      get children() {
        return new ElementCollection(...this._t.children);
      }
      /**
       * Check if this element has no children
       */
      isEmpty() {
        return this._t.children.length === 0;
      }
      /**
       * Check if this element belongs to the current player context
       */
      isMine() {
        if (!this._ctx.player)
          return false;
        return this.player === this._ctx.player;
      }
      /**
       * Get the branch path from root to this element (e.g., "0/2/1")
       */
      branch() {
        const path = [];
        let current = this;
        while (current?._t.parent) {
          const parent = current._t.parent;
          const index = parent._t.children.indexOf(current);
          path.unshift(index);
          current = parent;
        }
        return path.join("/");
      }
      /**
       * Find an element by its branch path
       */
      atBranch(branch) {
        if (!branch)
          return this;
        const indices = branch.split("/").map(Number);
        let current = this;
        for (const index of indices) {
          const child = current._t.children[index];
          if (!child)
            return void 0;
          current = child;
        }
        return current;
      }
      /**
       * Find an element by its immutable ID
       */
      atId(id) {
        if (this._t.id === id)
          return this;
        for (const child of this._t.children) {
          const found = child.atId(id);
          if (found)
            return found;
        }
        return void 0;
      }
      // ============================================
      // Element Creation
      // ============================================
      /**
       * Create a single child element
       */
      create(elementClass, name, attributes) {
        return this.createInternal(elementClass, name, attributes);
      }
      /**
       * Internal creation method called by command executor
       */
      createInternal(elementClass, name, attributes) {
        const element = new elementClass(this._ctx);
        element.name = name;
        element.game = this.game;
        if (attributes) {
          Object.assign(element, attributes);
        }
        this.addChild(element);
        const className = elementClass.name;
        if (!this._ctx.classRegistry.has(className)) {
          this._ctx.classRegistry.set(className, elementClass);
        }
        return element;
      }
      /**
       * Create multiple child elements
       */
      createMany(count, elementClass, name, attributes) {
        const elements = new ElementCollection();
        for (let i = 0; i < count; i++) {
          const attrs = typeof attributes === "function" ? attributes(i) : attributes;
          elements.push(this.create(elementClass, name, attrs));
        }
        return elements;
      }
      /**
       * Add a child element to this element
       */
      addChild(element) {
        element._t.parent = this;
        if (this._t.order === "stacking") {
          this._t.children.unshift(element);
        } else {
          this._t.children.push(element);
        }
      }
      /**
       * Remove a child element from this element
       */
      removeChild(element) {
        const index = this._t.children.indexOf(element);
        if (index !== -1) {
          this._t.children.splice(index, 1);
          element._t.parent = void 0;
        }
      }
      /**
       * Set the ordering mode for children
       */
      setOrder(order) {
        this._t.order = order;
      }
      all(classNameOrFinder, ...finders) {
        const collection = new ElementCollection(...this._t.children);
        return collection.all(classNameOrFinder, ...finders);
      }
      first(classNameOrFinder, ...finders) {
        const collection = new ElementCollection(...this._t.children);
        return collection.first(classNameOrFinder, ...finders);
      }
      firstN(n, classNameOrFinder, ...finders) {
        const collection = new ElementCollection(...this._t.children);
        return collection.firstN(n, classNameOrFinder, ...finders);
      }
      last(classNameOrFinder, ...finders) {
        const collection = new ElementCollection(...this._t.children);
        return collection.last(classNameOrFinder, ...finders);
      }
      lastN(n, classNameOrFinder, ...finders) {
        const collection = new ElementCollection(...this._t.children);
        return collection.lastN(n, classNameOrFinder, ...finders);
      }
      has(classNameOrFinder, ...finders) {
        const collection = new ElementCollection(...this._t.children);
        return collection.has(classNameOrFinder, ...finders);
      }
      count(classNameOrFinder, ...finders) {
        return this.all(classNameOrFinder, ...finders).length;
      }
      // ============================================
      // Visibility
      // ============================================
      /**
       * Get effective visibility (own or inherited from parent zone)
       */
      getEffectiveVisibility() {
        if (this._visibility?.explicit) {
          return this._visibility;
        }
        return resolveVisibility(this._visibility, this.getParentZoneVisibility());
      }
      /**
       * Get the zone visibility from the nearest parent Space
       */
      getParentZoneVisibility() {
        const parent = this._t.parent;
        if (!parent)
          return void 0;
        if ("getZoneVisibility" in parent && typeof parent.getZoneVisibility === "function") {
          const zoneVis = parent.getZoneVisibility();
          if (zoneVis)
            return zoneVis;
        }
        return parent.getParentZoneVisibility?.();
      }
      /**
       * Check if this element is visible to a player
       */
      isVisibleTo(player) {
        const position = typeof player === "number" ? player : player.position;
        const visibility = this.getEffectiveVisibility();
        const ownerPosition = this.getEffectiveOwner()?.position;
        return canPlayerSee(visibility, position, ownerPosition);
      }
      /**
       * Get the effective owner for visibility purposes
       * (this element's player, or inherited from parent)
       */
      getEffectiveOwner() {
        if (this.player)
          return this.player;
        return this._t.parent?.getEffectiveOwner();
      }
      /**
       * Check if this element is visible in the current context
       */
      isVisible() {
        if (!this._ctx.player)
          return true;
        return this.isVisibleTo(this._ctx.player);
      }
      /**
       * Internal method to set visibility (called by command executor)
       */
      setVisibilityInternal(visibility) {
        this._visibility = visibility;
      }
      /**
       * Internal method to add players to visibility list
       */
      addVisibleToInternal(players) {
        if (!this._visibility) {
          this._visibility = { ...DEFAULT_VISIBILITY, explicit: true };
        }
        this._visibility.addPlayers = Array.from(/* @__PURE__ */ new Set([...this._visibility.addPlayers ?? [], ...players]));
      }
      // ============================================
      // Serialization
      // ============================================
      /**
       * Serialize this element and its descendants to JSON
       */
      toJSON() {
        const className = this.constructor.name;
        const unserializable = new Set(this.constructor.unserializableAttributes);
        const attributes = {};
        for (const key of Object.keys(this)) {
          if (!unserializable.has(key) && !key.startsWith("_")) {
            const value = this[key];
            if (value !== void 0) {
              attributes[key] = this.serializeValue(value);
            }
          }
        }
        const json = {
          className,
          id: this._t.id,
          attributes
        };
        if (this.name) {
          json.name = this.name;
        }
        if (this._visibility?.explicit) {
          json.visibility = this._visibility;
        }
        if (this._t.children.length > 0) {
          json.children = this._t.children.map((child) => child.toJSON());
        }
        return json;
      }
      /**
       * Serialize a value for JSON
       */
      serializeValue(value) {
        if (value instanceof _GameElement) {
          return { __elementRef: value.branch() };
        }
        if (Array.isArray(value)) {
          return value.map((v) => this.serializeValue(v));
        }
        if (value && typeof value === "object") {
          const result = {};
          for (const [k, v] of Object.entries(value)) {
            result[k] = this.serializeValue(v);
          }
          return result;
        }
        return value;
      }
      /**
       * Create an element tree from JSON
       */
      static fromJSON(json, ctx, classRegistry) {
        const ElementClass = classRegistry.get(json.className);
        if (!ElementClass) {
          throw new Error(`Unknown element class: ${json.className}`);
        }
        const element = new ElementClass(ctx);
        element._t.id = json.id;
        if (json.name) {
          element.name = json.name;
        }
        if (json.visibility) {
          element._visibility = json.visibility;
        }
        for (const [key, value] of Object.entries(json.attributes)) {
          element[key] = value;
        }
        if (json.children) {
          for (const childJson of json.children) {
            const child = _GameElement.fromJSON(childJson, ctx, classRegistry);
            child._t.parent = element;
            element._t.children.push(child);
          }
        }
        return element;
      }
      // ============================================
      // ID Access
      // ============================================
      /**
       * Get the immutable ID
       */
      get id() {
        return this._t.id;
      }
    };
  }
});

// ../../../../board_game_service/BoardSmith/packages/engine/dist/element/space.js
var Space;
var init_space = __esm({
  "../../../../board_game_service/BoardSmith/packages/engine/dist/element/space.js"() {
    "use strict";
    init_game_element();
    init_visibility();
    Space = class extends GameElement {
      // ============================================
      // Layout Properties (for AutoUI rendering)
      // ============================================
      /**
       * Layout direction for children
       * @default 'horizontal'
       */
      $direction;
      /**
       * Gap between children (CSS value like '8px' or '0.5rem')
       */
      $gap;
      /**
       * Overlap ratio for stacked elements (0-1)
       * 0 = no overlap, 0.5 = 50% overlap, 0.9 = 90% overlap (deck-like)
       */
      $overlap;
      /**
       * Whether to fan children (like a hand of cards)
       * When true, children are rotated around a central point
       */
      $fan;
      /**
       * Fan angle in degrees for the entire spread
       * @default 30
       */
      $fanAngle;
      /**
       * Alignment of children within the space
       * @default 'center'
       */
      $align;
      // ============================================
      // Internal State
      // ============================================
      /** Event handlers for enter/exit events */
      _eventHandlers = { enter: [], exit: [] };
      /** Visibility mode for contents (not the space itself) */
      _zoneVisibility;
      static unserializableAttributes = [
        ...GameElement.unserializableAttributes,
        "_eventHandlers",
        "_zoneVisibility"
      ];
      constructor(ctx) {
        super(ctx);
      }
      // ============================================
      // Zone Visibility Configuration
      // ============================================
      /**
       * Set the visibility mode for this zone's contents (not the zone itself)
       * Children will inherit this unless they explicitly override
       */
      setZoneVisibility(mode) {
        this._zoneVisibility = visibilityFromMode(mode);
      }
      /**
       * Get the zone visibility (for children to inherit)
       */
      getZoneVisibility() {
        return this._zoneVisibility;
      }
      /**
       * Make contents visible to all players (default)
       */
      contentsVisible() {
        this.setZoneVisibility("all");
      }
      /**
       * Make contents visible only to the owner of this space
       */
      contentsVisibleToOwner() {
        this.setZoneVisibility("owner");
      }
      /**
       * Make contents hidden from all players
       */
      contentsHidden() {
        this.setZoneVisibility("hidden");
      }
      /**
       * Make contents show only count (e.g., opponent's hand size)
       */
      contentsCountOnly() {
        this.setZoneVisibility("count-only");
      }
      /**
       * Add specific players who can see contents (beyond zone default)
       */
      addZoneVisibleTo(...players) {
        const positions = players.map((p) => typeof p === "number" ? p : p.position);
        if (!this._zoneVisibility) {
          this._zoneVisibility = { mode: "all", explicit: true };
        }
        this._zoneVisibility.addPlayers = Array.from(/* @__PURE__ */ new Set([...this._zoneVisibility.addPlayers ?? [], ...positions]));
      }
      /**
       * Set players who cannot see contents (with 'all' mode)
       */
      hideContentsFrom(...players) {
        if (!this._zoneVisibility) {
          this._zoneVisibility = { mode: "all", explicit: true };
        }
        const positions = players.map((p) => typeof p === "number" ? p : p.position);
        this._zoneVisibility.exceptPlayers = Array.from(/* @__PURE__ */ new Set([...this._zoneVisibility.exceptPlayers ?? [], ...positions]));
      }
      // ============================================
      // Event Handlers
      // ============================================
      /**
       * Register a callback for when elements enter this space
       */
      onEnter(callback, elementClass) {
        this._eventHandlers.enter.push({ callback, elementClass });
      }
      /**
       * Register a callback for when elements exit this space
       */
      onExit(callback, elementClass) {
        this._eventHandlers.exit.push({ callback, elementClass });
      }
      /**
       * Trigger an event for an element
       */
      triggerEvent(type, element) {
        for (const handler of this._eventHandlers[type]) {
          if (!handler.elementClass || element instanceof handler.elementClass) {
            handler.callback(element);
          }
        }
      }
      // ============================================
      // Element Creation (override to trigger events)
      // ============================================
      create(elementClass, name, attributes) {
        const element = super.create(elementClass, name, attributes);
        this.triggerEvent("enter", element);
        return element;
      }
      // ============================================
      // Shuffle
      // ============================================
      /**
       * Shuffle the direct children of this space
       */
      shuffle() {
        this.shuffleInternal();
      }
      /**
       * Internal shuffle method called by command executor
       */
      shuffleInternal() {
        const random = this._ctx.random ?? Math.random;
        for (let i = this._t.children.length - 1; i > 0; i--) {
          const j = Math.floor(random() * (i + 1));
          [this._t.children[i], this._t.children[j]] = [
            this._t.children[j],
            this._t.children[i]
          ];
        }
      }
      // ============================================
      // Type guard
      // ============================================
      /**
       * Check if this element is a Space
       */
      isSpace() {
        return true;
      }
    };
  }
});

// ../../../../board_game_service/BoardSmith/packages/engine/dist/element/piece.js
var Piece;
var init_piece = __esm({
  "../../../../board_game_service/BoardSmith/packages/engine/dist/element/piece.js"() {
    "use strict";
    init_game_element();
    init_space();
    init_visibility();
    Piece = class extends GameElement {
      constructor(ctx) {
        super(ctx);
      }
      // ============================================
      // Movement
      // ============================================
      /**
       * Move this piece into another element (Space or Piece)
       */
      putInto(destination, options) {
        this.moveToInternal(destination, options?.position);
      }
      /**
       * Internal move method called by command executor
       */
      moveToInternal(destination, position) {
        const oldParent = this._t.parent;
        if (oldParent) {
          const index = oldParent._t.children.indexOf(this);
          if (index !== -1) {
            oldParent._t.children.splice(index, 1);
          }
          if (oldParent instanceof Space) {
            oldParent.triggerEvent("exit", this);
          }
        }
        this._t.parent = destination;
        const pos = position ?? (destination._t.order === "stacking" ? "first" : "last");
        if (pos === "first") {
          destination._t.children.unshift(this);
        } else {
          destination._t.children.push(this);
        }
        if (destination instanceof Space) {
          destination.triggerEvent("enter", this);
        }
      }
      /**
       * Remove this piece from play (moves to game.pile)
       */
      remove() {
        if (this.game.pile) {
          this.putInto(this.game.pile);
        }
      }
      // ============================================
      // Visibility Control (explicit overrides of zone default)
      // ============================================
      /**
       * Explicitly set this piece's visibility (overrides zone default)
       */
      setVisibility(mode) {
        this._visibility = visibilityFromMode(mode);
      }
      /**
       * Make this piece visible to all (overrides zone default)
       */
      showToAll() {
        this.setVisibility("all");
      }
      /**
       * Make this piece visible only to owner (overrides zone default)
       */
      showToOwner() {
        this.setVisibility("owner");
      }
      /**
       * Hide this piece from all (overrides zone default)
       */
      hideFromAll() {
        this.setVisibility("hidden");
      }
      /**
       * Add specific players who can see this piece (beyond inherited visibility)
       */
      addVisibleTo(...players) {
        const positions = players.map((p) => typeof p === "number" ? p : p.position);
        this.addVisibleToInternal(positions);
      }
      /**
       * Show this piece only to a specific player (hide from all others)
       */
      showOnlyTo(player) {
        const position = typeof player === "number" ? player : player.position;
        this._visibility = {
          mode: "hidden",
          addPlayers: [position],
          explicit: true
        };
      }
      /**
       * Hide this piece from specific players (visible to all others)
       */
      hideFrom(...players) {
        const positions = players.map((p) => typeof p === "number" ? p : p.position);
        this._visibility = {
          mode: "all",
          exceptPlayers: positions,
          explicit: true
        };
      }
      /**
       * Clear explicit visibility, reverting to inherited zone visibility
       */
      clearVisibility() {
        this._visibility = void 0;
      }
      // ============================================
      // Piece Restrictions
      // ============================================
      /**
       * Override create to prevent creating Spaces inside Pieces
       */
      create(elementClass, name, attributes) {
        if (elementClass === Space || Object.prototype.isPrototypeOf.call(Space, elementClass)) {
          throw new Error(`Cannot create Space "${name}" inside Piece "${this.name}"`);
        }
        return super.create(elementClass, name, attributes);
      }
      // ============================================
      // Type guard
      // ============================================
      /**
       * Check if this element is a Piece
       */
      isPiece() {
        return true;
      }
    };
  }
});

// ../../../../board_game_service/BoardSmith/packages/engine/dist/element/card.js
var Card;
var init_card = __esm({
  "../../../../board_game_service/BoardSmith/packages/engine/dist/element/card.js"() {
    "use strict";
    init_piece();
    Card = class extends Piece {
      /**
       * System property to identify this element type for AutoUI
       * $ prefix indicates this is a system property
       */
      $type;
      /** Whether the card is face-up (true) or face-down (false) */
      faceUp = true;
      constructor(ctx) {
        super(ctx);
        this.$type = "card";
      }
      /**
       * Flip the card to show the other face
       */
      flip() {
        this.faceUp = !this.faceUp;
      }
      /**
       * Set the card face-up
       */
      showFace() {
        this.faceUp = true;
      }
      /**
       * Set the card face-down
       */
      hideFace() {
        this.faceUp = false;
      }
    };
  }
});

// ../../../../board_game_service/BoardSmith/packages/engine/dist/element/hand.js
var Hand;
var init_hand = __esm({
  "../../../../board_game_service/BoardSmith/packages/engine/dist/element/hand.js"() {
    "use strict";
    init_space();
    Hand = class extends Space {
      /**
       * System property to identify this element type for AutoUI
       * $ prefix indicates this is a system property
       */
      $type;
      constructor(ctx) {
        super(ctx);
        this.$type = "hand";
        this.$direction = "horizontal";
        this.$fan = true;
        this.$fanAngle = 30;
        this.$overlap = 0.5;
        this.$align = "center";
      }
    };
  }
});

// ../../../../board_game_service/BoardSmith/packages/engine/dist/element/deck.js
var Deck;
var init_deck = __esm({
  "../../../../board_game_service/BoardSmith/packages/engine/dist/element/deck.js"() {
    "use strict";
    init_space();
    init_piece();
    Deck = class extends Space {
      /**
       * System property to identify this element type for AutoUI
       * $ prefix indicates this is a system property
       */
      $type;
      constructor(ctx) {
        super(ctx);
        this.$type = "deck";
        this.setOrder("stacking");
        this.$direction = "vertical";
        this.$overlap = 0.95;
        this.$align = "center";
      }
      /**
       * Draw cards from the deck directly to a destination
       *
       * This is a convenience method that combines `first()` + `putInto()` for the
       * common pattern of drawing cards to a player's hand or another space.
       *
       * @param destination - Where to put the drawn cards
       * @param count - Number of cards to draw (default: 1)
       * @param elementClass - Optional class to filter by (default: Piece)
       * @returns Array of drawn cards (may be fewer than count if deck runs out)
       *
       * @example
       * ```ts
       * // Draw 1 card to hand
       * deck.drawTo(player.hand);
       *
       * // Draw 5 cards to hand
       * deck.drawTo(player.hand, 5);
       *
       * // Draw 5 cards with type safety
       * const cards = deck.drawTo(player.hand, 5, Card);
       *
       * // Deal to multiple players
       * for (const player of game.players) {
       *   deck.drawTo(player.hand, 7);
       * }
       * ```
       */
      drawTo(destination, count = 1, elementClass) {
        const drawn = [];
        const cls = elementClass ?? Piece;
        for (let i = 0; i < count; i++) {
          const card = this.first(cls);
          if (!card)
            break;
          card.putInto(destination);
          drawn.push(card);
        }
        return drawn;
      }
    };
  }
});

// ../../../../board_game_service/BoardSmith/packages/engine/dist/element/die.js
var init_die = __esm({
  "../../../../board_game_service/BoardSmith/packages/engine/dist/element/die.js"() {
    "use strict";
    init_piece();
  }
});

// ../../../../board_game_service/BoardSmith/packages/engine/dist/element/dice-pool.js
var init_dice_pool = __esm({
  "../../../../board_game_service/BoardSmith/packages/engine/dist/element/dice-pool.js"() {
    "use strict";
    init_space();
    init_die();
  }
});

// ../../../../board_game_service/BoardSmith/packages/engine/dist/element/grid.js
var Grid, GridCell;
var init_grid = __esm({
  "../../../../board_game_service/BoardSmith/packages/engine/dist/element/grid.js"() {
    "use strict";
    init_space();
    Grid = class extends Space {
      /**
       * System-defined layout type
       * AutoUI uses this to determine how to render this container
       * $ prefix indicates this is a system property
       */
      $layout = "grid";
      /**
       * Labels for rows (optional - game designer provides these)
       * Example: ['8', '7', '6', '5', '4', '3', '2', '1'] for chess
       * If not provided, AutoUI will use numeric indices
       */
      $rowLabels;
      /**
       * Labels for columns (optional - game designer provides these)
       * Example: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] for chess
       * If not provided, AutoUI will use numeric indices
       */
      $columnLabels;
      /**
       * Name of the attribute on GridCell children that represents the row coordinate
       * Example: 'row', 'rank', 'y'
       * AutoUI uses this to position grid cells correctly
       */
      $rowCoord;
      /**
       * Name of the attribute on GridCell children that represents the column coordinate
       * Example: 'col', 'column', 'file', 'x'
       * AutoUI uses this to position grid cells correctly
       */
      $colCoord;
      static unserializableAttributes = [
        ...Space.unserializableAttributes
      ];
    };
    GridCell = class extends Space {
      /**
       * System-defined layout type
       * Indicates this is a positioned cell within a grid
       * $ prefix indicates this is a system property
       */
      $layout = "list";
      // GridCell itself is just a container
      static unserializableAttributes = [
        ...Space.unserializableAttributes
      ];
    };
  }
});

// ../../../../board_game_service/BoardSmith/packages/engine/dist/element/hex-grid.js
var HexGrid, HexCell;
var init_hex_grid = __esm({
  "../../../../board_game_service/BoardSmith/packages/engine/dist/element/hex-grid.js"() {
    "use strict";
    init_space();
    HexGrid = class extends Space {
      /**
       * System-defined layout type
       * AutoUI uses this to determine how to render this container
       * $ prefix indicates this is a system property
       */
      $layout = "hex-grid";
      /**
       * Hex orientation: flat-top or pointy-top
       * - flat: Flat edge at top and bottom (like a ⬡ rotated)
       * - pointy: Point at top and bottom (like a ⬡)
       * @default 'pointy'
       */
      $hexOrientation = "pointy";
      /**
       * Coordinate system used for hex cells
       * @default 'axial'
       */
      $coordSystem = "axial";
      /**
       * Name of the Q coordinate attribute on HexCell children (axial/cube)
       * @default 'q'
       */
      $qCoord;
      /**
       * Name of the R coordinate attribute on HexCell children (axial/cube)
       * @default 'r'
       */
      $rCoord;
      /**
       * Name of the S coordinate attribute on HexCell children (cube only)
       * For cube coordinates, s = -q - r
       */
      $sCoord;
      /**
       * Size of hexes in pixels (width for flat, height for pointy)
       * @default 50
       */
      $hexSize;
      static unserializableAttributes = [
        ...Space.unserializableAttributes
      ];
    };
    HexCell = class extends Space {
      /**
       * System property to identify this element type for AutoUI
       * $ prefix indicates this is a system property
       */
      $type;
      constructor(ctx) {
        super(ctx);
        this.$type = "hex-cell";
      }
      static unserializableAttributes = [
        ...Space.unserializableAttributes
      ];
    };
  }
});

// ../../../../board_game_service/BoardSmith/packages/engine/dist/player/player.js
var Player, PlayerCollection;
var init_player = __esm({
  "../../../../board_game_service/BoardSmith/packages/engine/dist/player/player.js"() {
    "use strict";
    init_element_collection();
    Player = class {
      /** Immutable seat position (0-indexed) */
      position;
      /** Player display name */
      name;
      /** Player color (hex code) */
      color;
      /** Player avatar URL */
      avatar;
      /** Reference to the game */
      game;
      /** Whether this player is currently taking their turn */
      _isCurrent = false;
      /** Attributes hidden from other players */
      static hiddenAttributes = [];
      constructor(position, name) {
        this.position = position;
        this.name = name;
      }
      /**
       * Check if this player is the current player
       */
      isCurrent() {
        return this._isCurrent;
      }
      /**
       * Set whether this player is current (called by game flow)
       */
      setCurrent(isCurrent) {
        this._isCurrent = isCurrent;
      }
      /**
       * Find all elements owned by this player
       */
      allMy(className, ...finders) {
        return this.game.all(className, { player: this }, ...finders);
      }
      /**
       * Find the first element owned by this player
       */
      my(className, ...finders) {
        return this.game.first(className, { player: this }, ...finders);
      }
      /**
       * Check if this player has any matching elements
       */
      has(className, ...finders) {
        return this.my(className, ...finders) !== void 0;
      }
      /**
       * Get string representation
       */
      toString() {
        return this.name;
      }
      /**
       * Serialize player to JSON
       */
      toJSON() {
        return {
          position: this.position,
          name: this.name,
          color: this.color,
          avatar: this.avatar
        };
      }
    };
    PlayerCollection = class _PlayerCollection extends Array {
      /** Index of the current player */
      _currentIndex = 0;
      /**
       * Get the current player
       */
      get current() {
        return this[this._currentIndex];
      }
      /**
       * Set the current player
       */
      setCurrent(player) {
        const index = typeof player === "number" ? player : player.position;
        if (this[this._currentIndex]) {
          this[this._currentIndex].setCurrent(false);
        }
        this._currentIndex = index;
        if (this[this._currentIndex]) {
          this[this._currentIndex].setCurrent(true);
        }
      }
      /**
       * Get the next player in turn order
       */
      next(from) {
        const currentPos = from?.position ?? this._currentIndex;
        const nextPos = (currentPos + 1) % this.length;
        return this[nextPos];
      }
      /**
       * Get the previous player in turn order
       */
      previous(from) {
        const currentPos = from?.position ?? this._currentIndex;
        const prevPos = (currentPos - 1 + this.length) % this.length;
        return this[prevPos];
      }
      /**
       * Get all other players (excluding the given player or current player)
       */
      others(excluding) {
        const excludePos = excluding?.position ?? this._currentIndex;
        const result = new _PlayerCollection();
        for (const player of this) {
          if (player.position !== excludePos) {
            result.push(player);
          }
        }
        return result;
      }
      /**
       * Get the other player (for 2-player games)
       */
      other(from) {
        if (this.length !== 2) {
          throw new Error("other() can only be used in 2-player games");
        }
        const fromPos = from?.position ?? this._currentIndex;
        return this.find((p) => p.position !== fromPos);
      }
      /**
       * Find a player by position
       */
      byPosition(position) {
        return this.find((p) => p.position === position);
      }
      /**
       * Get players in turn order starting from a given player
       */
      inOrderFrom(startPlayer) {
        const result = new _PlayerCollection();
        const startIndex = startPlayer.position;
        for (let i = 0; i < this.length; i++) {
          const index = (startIndex + i) % this.length;
          result.push(this[index]);
        }
        return result;
      }
      /**
       * Serialize to JSON
       */
      toJSON() {
        return this.map((p) => {
          if (typeof p.toJSON === "function") {
            return p.toJSON();
          }
          return {
            position: p.position,
            name: p.name,
            color: p.color,
            avatar: p.avatar
          };
        });
      }
    };
  }
});

// ../../../../board_game_service/BoardSmith/packages/engine/dist/command/executor.js
function executeCommand(game, command) {
  try {
    switch (command.type) {
      case "CREATE":
        return executeCreate(game, command);
      case "CREATE_MANY":
        return executeCreateMany(game, command);
      case "MOVE":
        return executeMove(game, command);
      case "REMOVE":
        return executeRemove(game, command);
      case "SHUFFLE":
        return executeShuffle(game, command);
      case "SET_ATTRIBUTE":
        return executeSetAttribute(game, command);
      case "SET_VISIBILITY":
        return executeSetVisibility(game, command);
      case "ADD_VISIBLE_TO":
        return executeAddVisibleTo(game, command);
      case "SET_CURRENT_PLAYER":
        return executeSetCurrentPlayer(game, command);
      case "MESSAGE":
        return executeMessage(game, command);
      case "START_GAME":
        return executeStartGame(game, command);
      case "END_GAME":
        return executeEndGame(game, command);
      case "SET_ORDER":
        return executeSetOrder(game, command);
      default:
        return { success: false, error: `Unknown command type: ${command.type}` };
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}
function executeCreate(game, command) {
  const parent = game.getElementById(command.parentId);
  if (!parent) {
    return { success: false, error: `Parent element not found: ${command.parentId}` };
  }
  const ElementClass = game.getElementClass(command.className);
  if (!ElementClass) {
    return { success: false, error: `Unknown element class: ${command.className}` };
  }
  const element = parent.createInternal(ElementClass, command.name, command.attributes);
  return { success: true, createdIds: [element.id] };
}
function executeCreateMany(game, command) {
  const parent = game.getElementById(command.parentId);
  if (!parent) {
    return { success: false, error: `Parent element not found: ${command.parentId}` };
  }
  const ElementClass = game.getElementClass(command.className);
  if (!ElementClass) {
    return { success: false, error: `Unknown element class: ${command.className}` };
  }
  const createdIds = [];
  for (let i = 0; i < command.count; i++) {
    const attrs = command.attributesList?.[i] ?? {};
    const element = parent.createInternal(ElementClass, command.name, attrs);
    createdIds.push(element.id);
  }
  return { success: true, createdIds };
}
function executeMove(game, command) {
  const element = game.getElementById(command.elementId);
  if (!element) {
    return { success: false, error: `Element not found: ${command.elementId}` };
  }
  const destination = game.getElementById(command.destinationId);
  if (!destination) {
    return { success: false, error: `Destination not found: ${command.destinationId}` };
  }
  element.moveToInternal(destination, command.position);
  return { success: true };
}
function executeRemove(game, command) {
  const element = game.getElementById(command.elementId);
  if (!element) {
    return { success: false, error: `Element not found: ${command.elementId}` };
  }
  element.moveToInternal(game.pile);
  return { success: true };
}
function executeShuffle(game, command) {
  const space = game.getElementById(command.spaceId);
  if (!space) {
    return { success: false, error: `Space not found: ${command.spaceId}` };
  }
  space.shuffleInternal();
  return { success: true };
}
function executeSetAttribute(game, command) {
  const element = game.getElementById(command.elementId);
  if (!element) {
    return { success: false, error: `Element not found: ${command.elementId}` };
  }
  element[command.attribute] = command.value;
  return { success: true };
}
function executeSetVisibility(game, command) {
  const element = game.getElementById(command.elementId);
  if (!element) {
    return { success: false, error: `Element not found: ${command.elementId}` };
  }
  let visibility;
  if (typeof command.visibility === "string") {
    visibility = visibilityFromMode(command.visibility);
  } else {
    visibility = {
      mode: command.visibility.mode,
      addPlayers: command.visibility.addPlayers,
      exceptPlayers: command.visibility.exceptPlayers,
      explicit: true
    };
  }
  element.setVisibilityInternal(visibility);
  return { success: true };
}
function executeAddVisibleTo(game, command) {
  const element = game.getElementById(command.elementId);
  if (!element) {
    return { success: false, error: `Element not found: ${command.elementId}` };
  }
  element.addVisibleToInternal(command.players);
  return { success: true };
}
function executeSetCurrentPlayer(game, command) {
  game.players.setCurrent(command.playerPosition);
  return { success: true };
}
function executeMessage(game, command) {
  game.addMessageInternal(command.text, command.data);
  return { success: true };
}
function executeStartGame(game, command) {
  if (game.phase !== "setup") {
    return { success: false, error: "Game has already started" };
  }
  game.phase = "started";
  return { success: true };
}
function executeEndGame(game, command) {
  game.phase = "finished";
  if (command.winners) {
    game.settings.winners = command.winners;
  }
  return { success: true };
}
function executeSetOrder(game, command) {
  const space = game.getElementById(command.spaceId);
  if (!space) {
    return { success: false, error: `Space not found: ${command.spaceId}` };
  }
  space._t.order = command.order;
  return { success: true };
}
var init_executor = __esm({
  "../../../../board_game_service/BoardSmith/packages/engine/dist/command/executor.js"() {
    "use strict";
    init_visibility();
  }
});

// ../../../../board_game_service/BoardSmith/packages/engine/dist/action/action.js
var Action, ActionExecutor;
var init_action = __esm({
  "../../../../board_game_service/BoardSmith/packages/engine/dist/action/action.js"() {
    "use strict";
    Action = class _Action {
      definition;
      constructor(name) {
        this.definition = {
          name,
          selections: [],
          execute: () => {
          }
        };
      }
      /**
       * Create a new action builder
       */
      static create(name) {
        return new _Action(name);
      }
      /**
       * Set the user-facing prompt for this action
       */
      prompt(prompt) {
        this.definition.prompt = prompt;
        return this;
      }
      /**
       * Add a condition for when this action is available
       */
      condition(fn) {
        this.definition.condition = fn;
        return this;
      }
      /**
       * Mark this action as non-undoable.
       * Use for actions that reveal hidden info, involve randomness, or shouldn't be undone.
       * When executed, undo is disabled for the rest of the turn.
       */
      notUndoable() {
        this.definition.undoable = false;
        return this;
      }
      /**
       * Add a choice selection
       */
      chooseFrom(name, options) {
        const selection = {
          type: "choice",
          name,
          prompt: options.prompt,
          choices: options.choices,
          display: options.display,
          skipIfOnlyOne: options.skipIfOnlyOne,
          optional: options.optional,
          validate: options.validate,
          boardRefs: options.boardRefs,
          filterBy: options.filterBy
        };
        this.definition.selections.push(selection);
        return this;
      }
      /**
       * Add a player selection
       */
      choosePlayer(name, options = {}) {
        const selection = {
          type: "player",
          name,
          prompt: options.prompt,
          filter: options.filter,
          skipIfOnlyOne: options.skipIfOnlyOne,
          optional: options.optional,
          validate: options.validate,
          boardRefs: options.boardRefs
        };
        this.definition.selections.push(selection);
        return this;
      }
      /**
       * Add an element selection (choose from board)
       */
      chooseElement(name, options = {}) {
        const selection = {
          type: "element",
          name,
          prompt: options.prompt,
          elementClass: options.elementClass,
          from: options.from,
          filter: options.filter,
          skipIfOnlyOne: options.skipIfOnlyOne,
          optional: options.optional,
          validate: options.validate,
          display: options.display,
          boardRef: options.boardRef
        };
        this.definition.selections.push(selection);
        return this;
      }
      /**
       * Add a text input selection
       */
      enterText(name, options = {}) {
        const selection = {
          type: "text",
          name,
          prompt: options.prompt,
          pattern: options.pattern,
          minLength: options.minLength,
          maxLength: options.maxLength,
          optional: options.optional,
          validate: options.validate
        };
        this.definition.selections.push(selection);
        return this;
      }
      /**
       * Add a number input selection
       */
      enterNumber(name, options = {}) {
        const selection = {
          type: "number",
          name,
          prompt: options.prompt,
          min: options.min,
          max: options.max,
          integer: options.integer,
          optional: options.optional,
          validate: options.validate
        };
        this.definition.selections.push(selection);
        return this;
      }
      /**
       * Set the execution handler for this action
       */
      execute(fn) {
        this.definition.execute = fn;
        return this.definition;
      }
      /**
       * Get the built definition (without execute, for inspection)
       */
      build() {
        return this.definition;
      }
    };
    ActionExecutor = class {
      game;
      constructor(game) {
        this.game = game;
      }
      /**
       * Resolve serialized args (player indices, element IDs) to actual objects.
       * This is needed because network-serialized args use indices/IDs instead of objects.
       */
      resolveArgs(action, args) {
        const resolved = { ...args };
        for (const selection of action.selections) {
          const value = args[selection.name];
          if (value === void 0)
            continue;
          switch (selection.type) {
            case "player": {
              if (typeof value === "number") {
                const player = this.game.players[value];
                if (player) {
                  resolved[selection.name] = player;
                }
              }
              break;
            }
            case "element": {
              if (typeof value === "number") {
                const element = this.game.getElementById(value);
                if (element) {
                  resolved[selection.name] = element;
                }
              }
              break;
            }
          }
        }
        return resolved;
      }
      /**
       * Get available choices for a selection given current args
       */
      getChoices(selection, player, args) {
        const context = {
          game: this.game,
          player,
          args
        };
        switch (selection.type) {
          case "choice": {
            const choiceSel = selection;
            let choices = typeof choiceSel.choices === "function" ? choiceSel.choices(context) : [...choiceSel.choices];
            if (choiceSel.filterBy) {
              const { key, selectionName } = choiceSel.filterBy;
              const previousValue = args[selectionName];
              if (previousValue !== void 0) {
                let filterValue;
                if (typeof previousValue === "object" && previousValue !== null) {
                  const prevObj = previousValue;
                  filterValue = prevObj[key] !== void 0 ? prevObj[key] : prevObj["id"];
                } else {
                  filterValue = previousValue;
                }
                choices = choices.filter((choice) => {
                  if (typeof choice === "object" && choice !== null) {
                    return choice[key] === filterValue;
                  }
                  return choice === filterValue;
                });
              }
            }
            return choices;
          }
          case "player": {
            const playerSel = selection;
            let players = [...this.game.players];
            if (playerSel.filter) {
              players = players.filter((p) => playerSel.filter(p, context));
            }
            return players;
          }
          case "element": {
            const elementSel = selection;
            const from = typeof elementSel.from === "function" ? elementSel.from(context) : elementSel.from ?? this.game;
            let elements;
            if (elementSel.elementClass) {
              elements = [...from.all(elementSel.elementClass)];
            } else {
              elements = [...from.all()];
            }
            if (elementSel.filter) {
              elements = elements.filter((e) => elementSel.filter(e, context));
            }
            return elements;
          }
          case "text":
          case "number":
            return [];
          default:
            return [];
        }
      }
      /**
       * Check if a selection should be skipped (only one valid choice)
       */
      shouldSkip(selection, player, args) {
        if (!selection.skipIfOnlyOne) {
          return { skip: false };
        }
        const choices = this.getChoices(selection, player, args);
        if (choices.length === 1) {
          return { skip: true, value: choices[0] };
        }
        return { skip: false };
      }
      /**
       * Check if two values are equal (handles objects by comparing JSON)
       */
      valuesEqual(a, b) {
        if (a === b)
          return true;
        if (typeof a !== typeof b)
          return false;
        if (typeof a === "object" && a !== null && b !== null) {
          return JSON.stringify(a) === JSON.stringify(b);
        }
        return false;
      }
      /**
       * Check if a value exists in a choices array (handles object comparison)
       */
      choicesContain(choices, value) {
        return choices.some((choice) => this.valuesEqual(choice, value));
      }
      /**
       * Validate a single selection value
       */
      validateSelection(selection, value, player, args) {
        const errors = [];
        const context = {
          game: this.game,
          player,
          args
        };
        if (selection.type === "choice" || selection.type === "player" || selection.type === "element") {
          const choices = this.getChoices(selection, player, args);
          if (!this.choicesContain(choices, value)) {
            errors.push(`Invalid selection for ${selection.name}`);
          }
        }
        switch (selection.type) {
          case "text": {
            const textSel = selection;
            const str = value;
            if (typeof str !== "string") {
              errors.push(`${selection.name} must be a string`);
            } else {
              if (textSel.minLength !== void 0 && str.length < textSel.minLength) {
                errors.push(`${selection.name} must be at least ${textSel.minLength} characters`);
              }
              if (textSel.maxLength !== void 0 && str.length > textSel.maxLength) {
                errors.push(`${selection.name} must be at most ${textSel.maxLength} characters`);
              }
              if (textSel.pattern && !textSel.pattern.test(str)) {
                errors.push(`${selection.name} does not match required pattern`);
              }
            }
            break;
          }
          case "number": {
            const numSel = selection;
            const num = value;
            if (typeof num !== "number" || isNaN(num)) {
              errors.push(`${selection.name} must be a number`);
            } else {
              if (numSel.min !== void 0 && num < numSel.min) {
                errors.push(`${selection.name} must be at least ${numSel.min}`);
              }
              if (numSel.max !== void 0 && num > numSel.max) {
                errors.push(`${selection.name} must be at most ${numSel.max}`);
              }
              if (numSel.integer && !Number.isInteger(num)) {
                errors.push(`${selection.name} must be an integer`);
              }
            }
            break;
          }
        }
        if (selection.validate && errors.length === 0) {
          const result = selection.validate(value, args, context);
          if (result !== true) {
            errors.push(typeof result === "string" ? result : `Invalid ${selection.name}`);
          }
        }
        return {
          valid: errors.length === 0,
          errors
        };
      }
      /**
       * Validate all arguments for an action
       */
      validateAction(action, player, args) {
        const allErrors = [];
        const context = {
          game: this.game,
          player,
          args
        };
        if (action.condition && !action.condition(context)) {
          return {
            valid: false,
            errors: ["Action is not available"]
          };
        }
        for (const selection of action.selections) {
          const value = args[selection.name];
          if (value === void 0) {
            if (!selection.optional) {
              allErrors.push(`Missing required selection: ${selection.name}`);
            }
            continue;
          }
          const result = this.validateSelection(selection, value, player, args);
          allErrors.push(...result.errors);
        }
        return {
          valid: allErrors.length === 0,
          errors: allErrors
        };
      }
      /**
       * Execute an action with the given arguments
       */
      executeAction(action, player, args) {
        const resolvedArgs = this.resolveArgs(action, args);
        const validation = this.validateAction(action, player, resolvedArgs);
        if (!validation.valid) {
          return {
            success: false,
            error: validation.errors.join("; ")
          };
        }
        const context = {
          game: this.game,
          player,
          args: resolvedArgs
        };
        try {
          const result = action.execute(resolvedArgs, context);
          return result ?? { success: true };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
      /**
       * Check if an action is available for a player.
       * For actions with dependent selections (filterBy), this checks if at least
       * one valid path through all selections exists.
       */
      isActionAvailable(action, player) {
        const context = {
          game: this.game,
          player,
          args: {}
        };
        if (action.condition && !action.condition(context)) {
          return false;
        }
        return this.hasValidSelectionPath(action.selections, player, {}, 0);
      }
      /**
       * Extract the value used for matching from a choice (for filterBy)
       */
      getChoiceFilterValue(choice, key) {
        if (typeof choice === "object" && choice !== null) {
          return choice[key];
        }
        return choice;
      }
      /**
       * Check if any selection after the given index depends on a selection by name
       */
      hasDependentSelection(selections, afterIndex, selectionName) {
        for (let i = afterIndex; i < selections.length; i++) {
          const sel = selections[i];
          if (sel.type === "choice") {
            const choiceSel = sel;
            if (choiceSel.filterBy?.selectionName === selectionName) {
              return true;
            }
          }
        }
        return false;
      }
      /**
       * Recursively check if there's a valid path through all selections.
       * For dependent selections, we need to verify at least one choice
       * leads to valid subsequent selections.
       *
       * OPTIMIZATION: We only do full path validation for choice selections
       * with static choices and filterBy. For element/player selections,
       * or choice selections with dynamic choices functions, the cost of
       * repeatedly computing choices is too high.
       */
      hasValidSelectionPath(selections, player, args, index) {
        if (index >= selections.length) {
          return true;
        }
        const selection = selections[index];
        if (selection.optional) {
          return this.hasValidSelectionPath(selections, player, args, index + 1);
        }
        if (selection.type === "text" || selection.type === "number") {
          return this.hasValidSelectionPath(selections, player, args, index + 1);
        }
        if (selection.type === "element" || selection.type === "player") {
          const choices2 = this.getChoices(selection, player, args);
          if (choices2.length === 0) {
            return false;
          }
          return this.hasValidSelectionPath(selections, player, args, index + 1);
        }
        if (selection.type === "choice") {
          const choiceSel = selection;
          if (typeof choiceSel.choices === "function") {
            const choices2 = this.getChoices(selection, player, args);
            if (choices2.length === 0) {
              return false;
            }
            return this.hasValidSelectionPath(selections, player, args, index + 1);
          }
        }
        const choices = this.getChoices(selection, player, args);
        if (choices.length === 0) {
          return false;
        }
        const hasDependent = this.hasDependentSelection(selections, index + 1, selection.name);
        if (!hasDependent) {
          return this.hasValidSelectionPath(selections, player, args, index + 1);
        }
        for (const choice of choices) {
          const newArgs = { ...args, [selection.name]: choice };
          if (this.hasValidSelectionPath(selections, player, newArgs, index + 1)) {
            return true;
          }
        }
        return false;
      }
    };
  }
});

// ../../../../board_game_service/BoardSmith/packages/engine/dist/flow/engine.js
function createContext(game, player, variables = {}) {
  return {
    game,
    player,
    variables,
    set: (name, value) => {
      variables[name] = value;
    },
    get: (name) => {
      return variables[name];
    }
  };
}
var DEFAULT_MAX_ITERATIONS, FlowEngine;
var init_engine = __esm({
  "../../../../board_game_service/BoardSmith/packages/engine/dist/flow/engine.js"() {
    "use strict";
    DEFAULT_MAX_ITERATIONS = 1e4;
    FlowEngine = class {
      game;
      definition;
      stack = [];
      variables = {};
      currentPlayer;
      awaitingInput = false;
      availableActions = [];
      prompt;
      complete = false;
      lastActionResult;
      /** For simultaneous action steps - tracks which players can act */
      awaitingPlayers = [];
      /** Current named phase (for UI display) */
      currentPhase;
      /** Move count for current action step with move limits */
      moveCount = 0;
      /** Current action step config (for move limit tracking) */
      currentActionConfig;
      constructor(game, definition) {
        this.game = game;
        this.definition = definition;
      }
      /**
       * Start the flow from the beginning
       */
      start() {
        const context = this.createContext();
        if (this.definition.setup) {
          this.definition.setup(context);
        }
        this.stack = [{ node: this.definition.root, index: 0, completed: false }];
        this.variables = { ...context.variables };
        this.currentPlayer = this.game.players.current;
        this.awaitingInput = false;
        this.complete = false;
        return this.run();
      }
      /**
       * Resume flow after player action
       * @param actionName The action to perform
       * @param args The action arguments
       * @param playerIndex Optional player index for simultaneous actions (if not provided, uses current player)
       */
      resume(actionName, args, playerIndex) {
        if (!this.awaitingInput) {
          throw new Error("Flow is not awaiting input");
        }
        const currentFrame = this.stack[this.stack.length - 1];
        if (currentFrame?.node.type === "simultaneous-action-step") {
          return this.resumeSimultaneousAction(actionName, args, playerIndex, currentFrame);
        }
        const result = this.game.performAction(actionName, this.currentPlayer, args);
        this.lastActionResult = result;
        if (!result.success) {
          return this.getState();
        }
        this.awaitingInput = false;
        if (currentFrame?.node.type === "action-step") {
          const config = currentFrame.node.config;
          const currentMoveCount = currentFrame.data?.moveCount ?? 0;
          const newMoveCount = currentMoveCount + 1;
          currentFrame.data = { ...currentFrame.data, moveCount: newMoveCount };
          if (config.maxMoves && newMoveCount >= config.maxMoves) {
            currentFrame.completed = true;
            this.currentActionConfig = void 0;
            this.moveCount = 0;
          } else if (config.repeatUntil) {
            const minMovesMet = !config.minMoves || newMoveCount >= config.minMoves;
            if (config.repeatUntil(this.createContext()) && minMovesMet) {
              currentFrame.completed = true;
              this.currentActionConfig = void 0;
              this.moveCount = 0;
            }
          } else if (!config.minMoves && !config.maxMoves) {
            currentFrame.completed = true;
            this.currentActionConfig = void 0;
            this.moveCount = 0;
          }
        }
        return this.run();
      }
      /**
       * Resume a simultaneous action step after a player's action
       */
      resumeSimultaneousAction(actionName, args, playerIndex, frame) {
        const config = frame.node.config;
        let actingPlayerIndex = playerIndex;
        if (actingPlayerIndex === void 0) {
          const firstAwaiting = this.awaitingPlayers.find((p) => !p.completed && p.availableActions.length > 0);
          if (firstAwaiting) {
            actingPlayerIndex = firstAwaiting.playerIndex;
          }
        }
        if (actingPlayerIndex === void 0) {
          throw new Error("No player specified and no awaiting players found");
        }
        const playerState = this.awaitingPlayers.find((p) => p.playerIndex === actingPlayerIndex);
        if (!playerState) {
          throw new Error(`Player ${actingPlayerIndex} is not awaiting action`);
        }
        if (playerState.completed) {
          throw new Error(`Player ${actingPlayerIndex} has already completed their action`);
        }
        if (!playerState.availableActions.includes(actionName)) {
          throw new Error(`Action ${actionName} is not available for player ${actingPlayerIndex}`);
        }
        const player = this.game.players[actingPlayerIndex];
        const result = this.game.performAction(actionName, player, args);
        this.lastActionResult = result;
        if (!result.success) {
          return this.getState();
        }
        const context = this.createContext();
        if (config.playerDone) {
          playerState.completed = config.playerDone(context, player);
        }
        if (!playerState.completed) {
          const actions = typeof config.actions === "function" ? config.actions(context, player) : config.actions;
          playerState.availableActions = actions.filter((actionName2) => {
            const action = this.game.getAction(actionName2);
            if (!action)
              return false;
            return this.game.getAvailableActions(player).some((a) => a.name === actionName2);
          });
          if (playerState.availableActions.length === 0) {
            playerState.completed = true;
          }
        }
        const allDone = config.allDone ? config.allDone(context) : this.awaitingPlayers.every((p) => p.completed);
        if (allDone) {
          this.awaitingInput = false;
          this.awaitingPlayers = [];
          frame.completed = true;
          return this.run();
        }
        return this.getState();
      }
      /**
       * Get the current flow state
       */
      getState() {
        const state = {
          position: this.getPosition(),
          complete: this.complete,
          awaitingInput: this.awaitingInput,
          currentPlayer: this.currentPlayer?.position,
          availableActions: this.awaitingInput ? this.availableActions : void 0,
          prompt: this.prompt,
          awaitingPlayers: this.awaitingPlayers.length > 0 ? this.awaitingPlayers : void 0,
          currentPhase: this.currentPhase
        };
        if (this.currentActionConfig && (this.currentActionConfig.minMoves || this.currentActionConfig.maxMoves)) {
          state.moveCount = this.moveCount;
          if (this.currentActionConfig.maxMoves) {
            state.movesRemaining = this.currentActionConfig.maxMoves - this.moveCount;
          }
          if (this.currentActionConfig.minMoves) {
            state.movesRequired = Math.max(0, this.currentActionConfig.minMoves - this.moveCount);
          }
        }
        return state;
      }
      /**
       * Restore flow from a serialized position
       */
      restore(position) {
        this.variables = { ...position.variables };
        this.stack = [];
        let currentNode = this.definition.root;
        for (let i = 0; i < position.path.length; i++) {
          const index = position.path[i];
          const iterationKey = `__iter_${i}`;
          const iteration = position.iterations[iterationKey] ?? 0;
          this.stack.push({
            node: currentNode,
            index,
            completed: false,
            data: { iteration }
          });
          currentNode = this.getChildNode(currentNode, index);
        }
        if (position.playerIndex !== void 0) {
          this.currentPlayer = this.game.players[position.playerIndex];
        }
      }
      /**
       * Check if the game is complete
       */
      isComplete() {
        return this.complete;
      }
      /**
       * Get the winners (if game is complete)
       */
      getWinners() {
        if (!this.complete)
          return [];
        if (this.definition.getWinners) {
          return this.definition.getWinners(this.createContext());
        }
        return [];
      }
      // ============================================
      // Private Methods
      // ============================================
      createContext() {
        const context = createContext(this.game, this.currentPlayer, this.variables);
        context.lastActionResult = this.lastActionResult;
        return context;
      }
      getPosition() {
        const path = [];
        const iterations = {};
        for (let i = 0; i < this.stack.length; i++) {
          const frame = this.stack[i];
          path.push(frame.index);
          if (frame.data?.iteration !== void 0) {
            iterations[`__iter_${i}`] = frame.data.iteration;
          }
        }
        return {
          path,
          iterations,
          playerIndex: this.currentPlayer?.position,
          variables: { ...this.variables }
        };
      }
      getChildNode(node, index) {
        switch (node.type) {
          case "sequence":
            return node.config.steps[index];
          case "loop":
          case "each-player":
          case "for-each":
          case "phase":
            return node.config.do;
          case "if":
            return index === 0 ? node.config.then : node.config.else ?? node.config.then;
          case "switch": {
            const cases = Object.values(node.config.cases);
            return cases[index] ?? node.config.default ?? cases[0];
          }
          default:
            return node;
        }
      }
      /**
       * Main execution loop - runs until awaiting input or complete
       */
      run() {
        let iterations = 0;
        while (this.stack.length > 0 && !this.awaitingInput && !this.complete) {
          iterations++;
          if (iterations > DEFAULT_MAX_ITERATIONS) {
            throw new Error("Flow exceeded maximum iterations - possible infinite loop");
          }
          const frame = this.stack[this.stack.length - 1];
          if (frame.completed) {
            this.stack.pop();
            continue;
          }
          const result = this.executeNode(frame);
          if (result.awaitingInput) {
            this.awaitingInput = true;
            break;
          }
          if (frame.completed) {
            this.stack.pop();
          }
          if (this.definition.isComplete?.(this.createContext())) {
            this.complete = true;
            break;
          }
        }
        if (this.stack.length === 0 || this.definition.isComplete?.(this.createContext())) {
          this.complete = true;
        }
        return this.getState();
      }
      /**
       * Execute a single flow node
       */
      executeNode(frame) {
        const context = this.createContext();
        switch (frame.node.type) {
          case "sequence":
            return this.executeSequence(frame, frame.node.config, context);
          case "loop":
            return this.executeLoop(frame, frame.node.config, context);
          case "each-player":
            return this.executeEachPlayer(frame, frame.node.config, context);
          case "for-each":
            return this.executeForEach(frame, frame.node.config, context);
          case "action-step":
            return this.executeActionStep(frame, frame.node.config, context);
          case "simultaneous-action-step":
            return this.executeSimultaneousActionStep(frame, frame.node.config, context);
          case "switch":
            return this.executeSwitch(frame, frame.node.config, context);
          case "if":
            return this.executeIf(frame, frame.node.config, context);
          case "execute":
            return this.executeExecute(frame, frame.node.config, context);
          case "phase":
            return this.executePhase(frame, frame.node.config, context);
          default:
            frame.completed = true;
            return { continue: true, awaitingInput: false };
        }
      }
      executeSequence(frame, config, context) {
        if (frame.index >= config.steps.length) {
          frame.completed = true;
          return { continue: true, awaitingInput: false };
        }
        const nextStep = config.steps[frame.index];
        this.stack.push({ node: nextStep, index: 0, completed: false });
        frame.index++;
        return { continue: true, awaitingInput: false };
      }
      executeLoop(frame, config, context) {
        const iteration = frame.data?.iteration ?? 0;
        const maxIterations = config.maxIterations ?? DEFAULT_MAX_ITERATIONS;
        if (iteration >= maxIterations) {
          frame.completed = true;
          return { continue: true, awaitingInput: false };
        }
        if (config.while && !config.while(context)) {
          frame.completed = true;
          return { continue: true, awaitingInput: false };
        }
        this.stack.push({ node: config.do, index: 0, completed: false });
        frame.data = { ...frame.data, iteration: iteration + 1 };
        frame.index++;
        return { continue: true, awaitingInput: false };
      }
      executeEachPlayer(frame, config, context) {
        let players = [...this.game.players];
        if (config.filter) {
          players = players.filter((p) => config.filter(p, context));
        }
        if (config.direction === "backward") {
          players.reverse();
        }
        if (frame.data?.playerIndex === void 0) {
          let startIndex = 0;
          if (config.startingPlayer) {
            const startPlayer = config.startingPlayer(context);
            startIndex = players.findIndex((p) => p === startPlayer);
            if (startIndex === -1)
              startIndex = 0;
          }
          frame.data = { ...frame.data, playerIndex: startIndex, players };
        }
        const playerIndex = frame.data.playerIndex;
        const playerList = frame.data.players ?? players;
        if (playerIndex >= playerList.length) {
          frame.completed = true;
          return { continue: true, awaitingInput: false };
        }
        this.currentPlayer = playerList[playerIndex];
        this.variables[config.name ?? "currentPlayer"] = this.currentPlayer;
        this.stack.push({ node: config.do, index: 0, completed: false });
        frame.data = { ...frame.data, playerIndex: playerIndex + 1 };
        frame.index++;
        return { continue: true, awaitingInput: false };
      }
      executeForEach(frame, config, context) {
        const items = typeof config.collection === "function" ? config.collection(context) : config.collection;
        const itemIndex = frame.data?.itemIndex ?? 0;
        if (itemIndex >= items.length) {
          frame.completed = true;
          return { continue: true, awaitingInput: false };
        }
        this.variables[config.as] = items[itemIndex];
        this.stack.push({ node: config.do, index: 0, completed: false });
        frame.data = { ...frame.data, itemIndex: itemIndex + 1 };
        frame.index++;
        return { continue: true, awaitingInput: false };
      }
      executeActionStep(frame, config, context) {
        if (config.skipIf?.(context)) {
          this.currentActionConfig = void 0;
          this.moveCount = 0;
          frame.completed = true;
          return { continue: true, awaitingInput: false };
        }
        if (frame.data?.moveCount === void 0) {
          frame.data = { ...frame.data, moveCount: 0 };
        }
        const moveCount = frame.data.moveCount;
        if (config.maxMoves && moveCount >= config.maxMoves) {
          this.currentActionConfig = void 0;
          this.moveCount = 0;
          frame.completed = true;
          return { continue: true, awaitingInput: false };
        }
        const minMovesMet = !config.minMoves || moveCount >= config.minMoves;
        if (this.lastActionResult && config.repeatUntil?.(context) && minMovesMet) {
          this.currentActionConfig = void 0;
          this.moveCount = 0;
          frame.completed = true;
          this.lastActionResult = void 0;
          return { continue: true, awaitingInput: false };
        }
        const player = config.player ? config.player(context) : context.player;
        if (!player) {
          throw new Error("ActionStep requires a player");
        }
        const actions = typeof config.actions === "function" ? config.actions(context) : config.actions;
        const available = actions.filter((actionName) => {
          const action = this.game.getAction(actionName);
          if (!action)
            return false;
          return this.game.getAvailableActions(player).some((a) => a.name === actionName);
        });
        if (available.length === 0 && minMovesMet) {
          this.currentActionConfig = void 0;
          this.moveCount = 0;
          frame.completed = true;
          return { continue: true, awaitingInput: false };
        }
        if (available.length === 0 && !minMovesMet) {
          throw new Error(`ActionStep requires ${config.minMoves} moves but only ${moveCount} were possible`);
        }
        this.currentActionConfig = config;
        this.moveCount = moveCount;
        this.currentPlayer = player;
        this.availableActions = available;
        this.prompt = typeof config.prompt === "function" ? config.prompt(context) : config.prompt;
        return {
          continue: false,
          awaitingInput: true,
          availableActions: available,
          currentPlayer: player
        };
      }
      executeSimultaneousActionStep(frame, config, context) {
        const players = config.players ? config.players(context) : [...this.game.players];
        this.awaitingPlayers = [];
        for (const player of players) {
          if (config.skipPlayer?.(context, player)) {
            continue;
          }
          if (config.playerDone?.(context, player)) {
            continue;
          }
          const actions = typeof config.actions === "function" ? config.actions(context, player) : config.actions;
          const available = actions.filter((actionName) => {
            const action = this.game.getAction(actionName);
            if (!action)
              return false;
            return this.game.getAvailableActions(player).some((a) => a.name === actionName);
          });
          if (available.length > 0) {
            this.awaitingPlayers.push({
              playerIndex: player.position,
              availableActions: available,
              completed: false
            });
          }
        }
        if (this.awaitingPlayers.length === 0) {
          frame.completed = true;
          return { continue: true, awaitingInput: false };
        }
        if (config.allDone?.(context)) {
          this.awaitingPlayers = [];
          frame.completed = true;
          return { continue: true, awaitingInput: false };
        }
        this.prompt = typeof config.prompt === "function" ? config.prompt(context) : config.prompt;
        return {
          continue: false,
          awaitingInput: true
        };
      }
      executeSwitch(frame, config, context) {
        if (frame.data?.branchPushed) {
          frame.completed = true;
          return { continue: true, awaitingInput: false };
        }
        const value = config.on(context);
        const stringValue = String(value);
        const branch = config.cases[stringValue] ?? config.default;
        if (!branch) {
          frame.completed = true;
          return { continue: true, awaitingInput: false };
        }
        this.stack.push({ node: branch, index: 0, completed: false });
        frame.data = { branchPushed: true };
        return { continue: true, awaitingInput: false };
      }
      executeIf(frame, config, context) {
        if (frame.data?.branchPushed) {
          frame.completed = true;
          return { continue: true, awaitingInput: false };
        }
        const condition = config.condition(context);
        if (condition) {
          this.stack.push({ node: config.then, index: 0, completed: false });
          frame.data = { branchPushed: true };
        } else if (config.else) {
          this.stack.push({ node: config.else, index: 0, completed: false });
          frame.data = { branchPushed: true };
        } else {
          frame.completed = true;
        }
        return { continue: true, awaitingInput: false };
      }
      executeExecute(frame, config, context) {
        config.fn(context);
        this.variables = { ...context.variables };
        frame.completed = true;
        return { continue: true, awaitingInput: false };
      }
      executePhase(frame, config, context) {
        if (!frame.data?.entered) {
          const previousPhase = this.currentPhase;
          this.currentPhase = config.name;
          if (this.definition.onEnterPhase) {
            this.definition.onEnterPhase(config.name, context);
          }
          this.stack.push({ node: config.do, index: 0, completed: false });
          frame.data = { entered: true, previousPhase };
          return { continue: true, awaitingInput: false };
        }
        if (this.definition.onExitPhase) {
          this.definition.onExitPhase(config.name, context);
        }
        this.currentPhase = frame.data.previousPhase;
        frame.completed = true;
        return { continue: true, awaitingInput: false };
      }
    };
  }
});

// ../../../../board_game_service/BoardSmith/packages/engine/dist/element/game.js
function createSeededRandom(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return function() {
    h |= 0;
    h = h + 1831565813 | 0;
    let t = Math.imul(h ^ h >>> 15, 1 | h);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var Game;
var init_game = __esm({
  "../../../../board_game_service/BoardSmith/packages/engine/dist/element/game.js"() {
    "use strict";
    init_space();
    init_game_element();
    init_player();
    init_executor();
    init_action();
    init_engine();
    Game = class extends Space {
      /**
       * Optional function to transform state for each player's view.
       * Override in subclass for custom attribute-level filtering.
       */
      static playerView;
      /** Container for removed elements */
      pile;
      /** All players in the game */
      players = new PlayerCollection();
      /** Current game phase */
      phase = "setup";
      /** Seeded random number generator */
      random;
      /** Message log */
      messages = [];
      /** Game settings */
      settings = {};
      /** Command history for event sourcing */
      commandHistory = [];
      /** Registered actions */
      _actions = /* @__PURE__ */ new Map();
      /** Action executor for validation and execution */
      _actionExecutor;
      /** Flow definition for this game */
      _flowDefinition;
      /** Flow engine instance */
      _flowEngine;
      static unserializableAttributes = [
        ...Space.unserializableAttributes,
        "pile",
        "players",
        "random",
        "commandHistory",
        "_actions",
        "_actionExecutor",
        "_flowDefinition",
        "_flowEngine"
      ];
      constructor(options) {
        const seed = options.seed ?? Math.random().toString(36).substring(2);
        const random = createSeededRandom(seed);
        const ctx = {
          sequence: 0,
          classRegistry: /* @__PURE__ */ new Map(),
          random
        };
        super(ctx);
        this.random = random;
        this.game = this;
        this._ctx.game = this;
        this._ctx.classRegistry.set("Space", Space);
        this._ctx.classRegistry.set("GameElement", GameElement);
        this.pile = this.createElement(Space, "__pile__");
        this.pile._t.parent = void 0;
        for (let i = 0; i < options.playerCount; i++) {
          const name = options.playerNames?.[i] ?? `Player ${i + 1}`;
          const player = this.createPlayer(i, name);
          player.game = this;
          this.players.push(player);
        }
        if (this.players.length > 0) {
          this.players.setCurrent(0);
        }
        this._actionExecutor = new ActionExecutor(this);
      }
      /**
       * Factory method to create players - override to use custom Player class
       */
      createPlayer(position, name) {
        return new Player(position, name);
      }
      /**
       * Register element classes for serialization/deserialization.
       * Call this in your game constructor before creating elements.
       *
       * @example
       * ```typescript
       * constructor(options: MyGameOptions) {
       *   super(options);
       *   this.registerElements([Card, Hand, Deck, DiscardPile]);
       *   // ... create elements
       * }
       * ```
       */
      registerElements(classes) {
        for (const cls of classes) {
          const className = cls.name;
          if (!this._ctx.classRegistry.has(className)) {
            this._ctx.classRegistry.set(className, cls);
          }
        }
      }
      /**
       * Create an element without adding it to the tree (internal use)
       */
      createElement(elementClass, name) {
        const element = new elementClass(this._ctx);
        element.name = name;
        element.game = this;
        const className = elementClass.name;
        if (!this._ctx.classRegistry.has(className)) {
          this._ctx.classRegistry.set(className, elementClass);
        }
        return element;
      }
      // ============================================
      // Element Lookup
      // ============================================
      /**
       * Find an element by its ID anywhere in the game tree
       */
      getElementById(id) {
        const found = this.atId(id);
        if (found)
          return found;
        return this.pile.atId(id);
      }
      /**
       * Get an element class by name (for command execution)
       */
      getElementClass(className) {
        return this._ctx.classRegistry.get(className);
      }
      // ============================================
      // Command Execution
      // ============================================
      /**
       * Execute a command and record it in history
       */
      execute(command) {
        const result = executeCommand(this, command);
        if (result.success) {
          this.commandHistory.push(command);
        }
        return result;
      }
      /**
       * Replay commands to rebuild state
       */
      replayCommands(commands) {
        for (const command of commands) {
          const result = executeCommand(this, command);
          if (!result.success) {
            throw new Error(`Failed to replay command: ${result.error}`);
          }
          this.commandHistory.push(command);
        }
      }
      // ============================================
      // Action System
      // ============================================
      /**
       * Register an action definition
       */
      registerAction(action) {
        this._actions.set(action.name, action);
      }
      /**
       * Register multiple actions
       */
      registerActions(...actions) {
        for (const action of actions) {
          this.registerAction(action);
        }
      }
      /**
       * Get an action definition by name
       */
      getAction(name) {
        return this._actions.get(name);
      }
      /**
       * Get all registered action names
       */
      getActionNames() {
        return [...this._actions.keys()];
      }
      /**
       * Get available actions for a player
       */
      getAvailableActions(player) {
        const available = [];
        for (const action of this._actions.values()) {
          if (this._actionExecutor.isActionAvailable(action, player)) {
            available.push(action);
          }
        }
        return available;
      }
      /**
       * Get the action executor (for advanced usage like building action metadata)
       */
      getActionExecutor() {
        return this._actionExecutor;
      }
      /**
       * Get the choices for a selection (for UI)
       */
      getSelectionChoices(actionName, selectionName, player, args = {}) {
        const action = this._actions.get(actionName);
        if (!action)
          return [];
        const selection = action.selections.find((s) => s.name === selectionName);
        if (!selection)
          return [];
        return this._actionExecutor.getChoices(selection, player, args);
      }
      /**
       * Perform an action with the given arguments
       */
      performAction(actionName, player, args) {
        const action = this._actions.get(actionName);
        if (!action) {
          return { success: false, error: `Unknown action: ${actionName}` };
        }
        return this._actionExecutor.executeAction(action, player, args);
      }
      /**
       * Perform an action from serialized form (for network play)
       */
      performSerializedAction(serialized) {
        const player = this.players[serialized.player];
        if (!player) {
          return { success: false, error: `Invalid player: ${serialized.player}` };
        }
        return this.performAction(serialized.name, player, serialized.args);
      }
      // ============================================
      // Flow System
      // ============================================
      /**
       * Set the flow definition for this game
       */
      setFlow(definition) {
        this._flowDefinition = definition;
      }
      /**
       * Get the flow definition
       */
      getFlow() {
        return this._flowDefinition;
      }
      /**
       * Start the game flow
       */
      startFlow() {
        if (!this._flowDefinition) {
          throw new Error("No flow definition set");
        }
        this._flowEngine = new FlowEngine(this, this._flowDefinition);
        const state = this._flowEngine.start();
        if (this.phase === "setup") {
          this.phase = "started";
        }
        if (state.complete) {
          this.phase = "finished";
        }
        return state;
      }
      /**
       * Resume flow after player action
       * @param actionName Action name to perform
       * @param args Action arguments
       * @param playerIndex Optional player index for simultaneous actions
       */
      continueFlow(actionName, args, playerIndex) {
        if (!this._flowEngine) {
          throw new Error("Flow not started");
        }
        const state = this._flowEngine.resume(actionName, args, playerIndex);
        if (state.complete) {
          this.phase = "finished";
          const winners = this._flowEngine.getWinners();
          if (winners.length > 0) {
            this.settings.winners = winners.map((p) => p.position);
          }
        }
        return state;
      }
      /**
       * Get current flow state
       */
      getFlowState() {
        return this._flowEngine?.getState();
      }
      /**
       * Restore flow from serialized position
       */
      restoreFlow(position) {
        if (!this._flowDefinition) {
          throw new Error("No flow definition set");
        }
        this._flowEngine = new FlowEngine(this, this._flowDefinition);
        this._flowEngine.restore(position);
      }
      /**
       * Check if flow is awaiting player input
       */
      isAwaitingInput() {
        return this._flowEngine?.getState().awaitingInput ?? false;
      }
      /**
       * Get current player from flow (if awaiting input)
       */
      getCurrentFlowPlayer() {
        const state = this._flowEngine?.getState();
        if (state?.currentPlayer !== void 0) {
          return this.players[state.currentPlayer];
        }
        return void 0;
      }
      /**
       * Get available actions from flow (if awaiting input)
       */
      getFlowAvailableActions() {
        return this._flowEngine?.getState().availableActions ?? [];
      }
      /**
       * Get awaiting players for simultaneous actions
       * Returns undefined if not in a simultaneous action step
       */
      getAwaitingPlayers() {
        const state = this._flowEngine?.getState();
        return state?.awaitingPlayers;
      }
      /**
       * Check if a player can act (either as current player or in simultaneous action)
       */
      canPlayerAct(playerIndex) {
        const state = this._flowEngine?.getState();
        if (!state?.awaitingInput)
          return false;
        if (state.awaitingPlayers && state.awaitingPlayers.length > 0) {
          const playerState = state.awaitingPlayers.find((p) => p.playerIndex === playerIndex);
          return playerState ? !playerState.completed && playerState.availableActions.length > 0 : false;
        }
        return state.currentPlayer === playerIndex;
      }
      // ============================================
      // Game Lifecycle
      // ============================================
      /**
       * Start the game (called after setup)
       */
      start() {
        if (this.phase !== "setup") {
          throw new Error("Game has already started");
        }
        this.phase = "started";
      }
      /**
       * End the game
       */
      finish(winners) {
        this.phase = "finished";
        if (winners) {
          this.settings.winners = winners.map((p) => p.position);
        }
      }
      /**
       * Check if the game is finished
       */
      isFinished() {
        return this.phase === "finished";
      }
      /**
       * Get the winners (if game is finished)
       */
      getWinners() {
        const positions = this.settings.winners;
        if (!positions)
          return [];
        return positions.map((pos) => this.players[pos]);
      }
      // ============================================
      // Player Context
      // ============================================
      /**
       * Set the current player context for "mine" queries
       */
      setPlayerContext(player) {
        if (player === void 0) {
          this._ctx.player = void 0;
        } else if (typeof player === "number") {
          this._ctx.player = this.players[player];
        } else {
          this._ctx.player = player;
        }
      }
      /**
       * Get the current player context
       */
      getPlayerContext() {
        return this._ctx.player;
      }
      // ============================================
      // Messaging
      // ============================================
      /**
       * Add a message to the game log
       */
      message(text, data) {
        this.addMessageInternal(text, data);
      }
      /**
       * Internal method to add a message (called by command executor)
       */
      addMessageInternal(text, data) {
        this.messages.push({ text, data });
      }
      /**
       * Get formatted messages (with template substitution)
       */
      getFormattedMessages() {
        return this.messages.map(({ text, data }) => {
          if (!data)
            return text;
          let processed = text;
          for (const [key, value] of Object.entries(data)) {
            const replacement = value instanceof GameElement ? value.toString() : value instanceof Player ? value.name : String(value);
            processed = processed.replace(new RegExp(`{{${key}}}`, "g"), replacement);
          }
          return processed;
        });
      }
      // ============================================
      // Serialization
      // ============================================
      /**
       * Serialize the complete game state
       */
      toJSON() {
        return {
          ...super.toJSON(),
          players: this.players.toJSON(),
          phase: this.phase,
          messages: this.messages,
          settings: this.settings
        };
      }
      /**
       * Get the game state from the perspective of a specific player
       * (hides elements that player shouldn't see based on zone visibility)
       * @param player - Player, player position, or null for spectator view
       */
      toJSONForPlayer(player) {
        const position = player === null ? null : typeof player === "number" ? player : player.position;
        const visibilityPosition = position ?? -1;
        const filterElement = (json, element) => {
          const visibility = element.getEffectiveVisibility();
          if (visibility.mode === "count-only" && !element.isVisibleTo(visibilityPosition)) {
            const systemAttrs = {};
            for (const [key, value] of Object.entries(json.attributes ?? {})) {
              if (key.startsWith("$")) {
                systemAttrs[key] = value;
              }
            }
            return {
              className: json.className,
              id: json.id,
              name: json.name,
              attributes: systemAttrs,
              childCount: element._t.children.length
            };
          }
          if (!element.isVisibleTo(visibilityPosition)) {
            return {
              className: json.className,
              id: json.id,
              attributes: { __hidden: true }
            };
          }
          const zoneVisibility = element.getZoneVisibility?.();
          if (zoneVisibility) {
            if (zoneVisibility.mode === "hidden") {
              const hiddenChildren = [];
              if (json.children) {
                for (const childJson of json.children) {
                  const systemAttrs = { __hidden: true };
                  for (const [key, value] of Object.entries(childJson.attributes ?? {})) {
                    if (key.startsWith("$")) {
                      systemAttrs[key] = value;
                    }
                  }
                  hiddenChildren.push({
                    className: childJson.className,
                    id: childJson.id,
                    attributes: systemAttrs
                  });
                }
              }
              return {
                ...json,
                children: hiddenChildren.length > 0 ? hiddenChildren : void 0,
                childCount: element._t.children.length
              };
            } else if (zoneVisibility.mode === "count-only") {
              return {
                ...json,
                children: void 0,
                childCount: element._t.children.length
              };
            } else if (zoneVisibility.mode === "owner" && element.player?.position !== visibilityPosition) {
              const hiddenChildren = [];
              if (json.children) {
                for (const childJson of json.children) {
                  const systemAttrs = { __hidden: true };
                  for (const [key, value] of Object.entries(childJson.attributes ?? {})) {
                    if (key.startsWith("$")) {
                      systemAttrs[key] = value;
                    }
                  }
                  hiddenChildren.push({
                    className: childJson.className,
                    id: childJson.id,
                    attributes: systemAttrs
                  });
                }
              }
              return {
                ...json,
                children: hiddenChildren.length > 0 ? hiddenChildren : void 0
              };
            }
          }
          const filteredChildren = [];
          if (json.children) {
            for (let i = 0; i < json.children.length; i++) {
              const childJson = json.children[i];
              const childElement = element._t.children[i];
              const filtered = filterElement(childJson, childElement);
              if (filtered) {
                filteredChildren.push(filtered);
              }
            }
          }
          return {
            ...json,
            children: filteredChildren.length > 0 ? filteredChildren : void 0
          };
        };
        const fullJson = this.toJSON();
        let filteredState = filterElement(fullJson, this) ?? fullJson;
        const GameClass = this.constructor;
        if (GameClass.playerView) {
          filteredState = GameClass.playerView(filteredState, position, this);
        }
        return filteredState;
      }
      /**
       * Create a game from serialized JSON
       */
      static restoreGame(json, GameClass, classRegistry) {
        const game = new GameClass({
          playerCount: json.players.length,
          playerNames: json.players.map((p) => p.name)
        });
        for (const [name, cls] of classRegistry) {
          game._ctx.classRegistry.set(name, cls);
        }
        game.phase = json.phase;
        game.messages = json.messages;
        game.settings = json.settings;
        game._t.children = [];
        if (json.children) {
          for (const childJson of json.children) {
            const child = GameElement.fromJSON(childJson, game._ctx, game._ctx.classRegistry);
            child._t.parent = game;
            child.game = game;
            game._t.children.push(child);
          }
        }
        return game;
      }
    };
  }
});

// ../../../../board_game_service/BoardSmith/packages/engine/dist/element/index.js
var init_element = __esm({
  "../../../../board_game_service/BoardSmith/packages/engine/dist/element/index.js"() {
    "use strict";
    init_game_element();
    init_space();
    init_piece();
    init_card();
    init_hand();
    init_deck();
    init_die();
    init_dice_pool();
    init_grid();
    init_hex_grid();
    init_game();
    init_element_collection();
  }
});

// ../../../../board_game_service/BoardSmith/packages/engine/dist/player/abilities.js
var init_abilities = __esm({
  "../../../../board_game_service/BoardSmith/packages/engine/dist/player/abilities.js"() {
    "use strict";
  }
});

// ../../../../board_game_service/BoardSmith/packages/engine/dist/player/index.js
var init_player2 = __esm({
  "../../../../board_game_service/BoardSmith/packages/engine/dist/player/index.js"() {
    "use strict";
    init_player();
    init_abilities();
  }
});

// ../../../../board_game_service/BoardSmith/packages/engine/dist/scoring/track.js
var init_track = __esm({
  "../../../../board_game_service/BoardSmith/packages/engine/dist/scoring/track.js"() {
    "use strict";
  }
});

// ../../../../board_game_service/BoardSmith/packages/engine/dist/scoring/index.js
var init_scoring = __esm({
  "../../../../board_game_service/BoardSmith/packages/engine/dist/scoring/index.js"() {
    "use strict";
    init_track();
  }
});

// ../../../../board_game_service/BoardSmith/packages/engine/dist/command/index.js
var init_command = __esm({
  "../../../../board_game_service/BoardSmith/packages/engine/dist/command/index.js"() {
    "use strict";
    init_visibility();
    init_executor();
  }
});

// ../../../../board_game_service/BoardSmith/packages/engine/dist/action/index.js
var init_action2 = __esm({
  "../../../../board_game_service/BoardSmith/packages/engine/dist/action/index.js"() {
    "use strict";
    init_action();
  }
});

// ../../../../board_game_service/BoardSmith/packages/engine/dist/flow/builders.js
function sequence(...steps) {
  return {
    type: "sequence",
    config: { steps }
  };
}
function phase(name, config) {
  return {
    type: "phase",
    config: {
      name,
      do: config.do
    }
  };
}
function loop(config) {
  return {
    type: "loop",
    config: {
      name: config.name,
      while: config.while,
      maxIterations: config.maxIterations,
      do: config.do
    }
  };
}
function eachPlayer(config) {
  return {
    type: "each-player",
    config: {
      name: config.name,
      filter: config.filter,
      direction: config.direction,
      startingPlayer: config.startingPlayer,
      do: config.do
    }
  };
}
function actionStep(config) {
  return {
    type: "action-step",
    config: {
      name: config.name,
      player: config.player,
      actions: config.actions,
      prompt: config.prompt,
      repeatUntil: config.repeatUntil,
      skipIf: config.skipIf,
      timeout: config.timeout,
      minMoves: config.minMoves,
      maxMoves: config.maxMoves
    }
  };
}
function execute(fn) {
  return {
    type: "execute",
    config: { fn }
  };
}
var init_builders = __esm({
  "../../../../board_game_service/BoardSmith/packages/engine/dist/flow/builders.js"() {
    "use strict";
  }
});

// ../../../../board_game_service/BoardSmith/packages/engine/dist/flow/turn-order.js
var init_turn_order = __esm({
  "../../../../board_game_service/BoardSmith/packages/engine/dist/flow/turn-order.js"() {
    "use strict";
  }
});

// ../../../../board_game_service/BoardSmith/packages/engine/dist/flow/index.js
var init_flow = __esm({
  "../../../../board_game_service/BoardSmith/packages/engine/dist/flow/index.js"() {
    "use strict";
    init_engine();
    init_builders();
    init_turn_order();
  }
});

// ../../../../board_game_service/BoardSmith/packages/engine/dist/utils/serializer.js
var init_serializer = __esm({
  "../../../../board_game_service/BoardSmith/packages/engine/dist/utils/serializer.js"() {
    "use strict";
  }
});

// ../../../../board_game_service/BoardSmith/packages/engine/dist/utils/snapshot.js
var init_snapshot = __esm({
  "../../../../board_game_service/BoardSmith/packages/engine/dist/utils/snapshot.js"() {
    "use strict";
  }
});

// ../../../../board_game_service/BoardSmith/packages/engine/dist/utils/replay.js
var init_replay = __esm({
  "../../../../board_game_service/BoardSmith/packages/engine/dist/utils/replay.js"() {
    "use strict";
  }
});

// ../../../../board_game_service/BoardSmith/packages/engine/dist/utils/index.js
var init_utils = __esm({
  "../../../../board_game_service/BoardSmith/packages/engine/dist/utils/index.js"() {
    "use strict";
    init_serializer();
    init_snapshot();
    init_replay();
  }
});

// ../../../../board_game_service/BoardSmith/packages/engine/dist/sandbox/index.js
var init_sandbox = __esm({
  "../../../../board_game_service/BoardSmith/packages/engine/dist/sandbox/index.js"() {
    "use strict";
  }
});

// ../../../../board_game_service/BoardSmith/packages/engine/dist/index.js
var init_dist = __esm({
  "../../../../board_game_service/BoardSmith/packages/engine/dist/index.js"() {
    "use strict";
    init_element();
    init_player2();
    init_scoring();
    init_command();
    init_action2();
    init_flow();
    init_utils();
    init_sandbox();
  }
});

// src/rules/constants.ts
function getSetupConfiguration(setupData, rebelCount) {
  return setupData.setupConfigurations.find((c) => c.rebels === rebelCount);
}
function getTotalSectors(config) {
  return config.mapSize[0] * config.mapSize[1];
}
function getReinforcementAmount(rebelCount) {
  return Math.ceil(rebelCount / 2) + 1;
}
var CombatConstants, MercConstants, SectorConstants, TeamConstants, DictatorConstants, GameDurationConstants, ReinforcementTable, TieBreakers, AdjacencyConstants, ExpansionConstants, GameConstants;
var init_constants = __esm({
  "src/rules/constants.ts"() {
    "use strict";
    CombatConstants = {
      /** Dice roll of 4, 5, or 6 is a hit */
      HIT_THRESHOLD: 4,
      /** Six-sided dice */
      DICE_SIDES: 6,
      /** Fixed initiative for all militia */
      MILITIA_INITIATIVE: 2,
      /** Militia roll 1 die each */
      MILITIA_COMBAT: 1,
      /** Militia die in one hit */
      MILITIA_HEALTH: 1,
      /** Militia have no armor */
      MILITIA_ARMOR: 0,
      /** Militia target 1 enemy */
      MILITIA_TARGETS: 1
    };
    MercConstants = {
      /** All MERCs start with 3 health */
      BASE_HEALTH: 3,
      /** All MERCs can target 1 enemy by default */
      BASE_TARGETS: 1,
      /** All MERCs start with 0 armor */
      BASE_ARMOR: 0,
      /** All MERCs have 2 actions per day */
      ACTIONS_PER_DAY: 2,
      /** Typical skill value range minimum */
      SKILL_MIN: 0,
      /** Typical skill value range maximum (can go higher with equipment) */
      SKILL_MAX: 3
    };
    SectorConstants = {
      /** Maximum militia per faction per sector */
      MAX_MILITIA_PER_SIDE: 10
    };
    TeamConstants = {
      /** First MERC is always free */
      FREE_MERCS: 1,
      /** Rebels hire 2 MERCs on Day 1 */
      STARTING_MERCS: 2,
      /** Primary and Secondary squads */
      MAX_SQUADS: 2,
      /**
       * Team Limit Formula: 1 + controlled sectors
       * One MERC per controlled sector + free MERC
       */
      BASE_TEAM_LIMIT: 1
    };
    DictatorConstants = {
      /** Dictator hires 1 random MERC on Day 1 */
      STARTING_MERCS: 1,
      /** Dictator fills hand to 3 Tactics cards */
      HAND_SIZE: 3,
      /** Number of Tactics cards in active play */
      ACTIVE_TACTICS_CARDS: 5,
      /** Dictator has no team limit */
      TEAM_LIMIT: Infinity
    };
    GameDurationConstants = {
      /** Total days: 1 setup day + 5 play days */
      TOTAL_DAYS: 6,
      /** Day 1 is the special landing/setup round */
      SETUP_DAY: 1,
      /** Normal play starts on day 2 */
      FIRST_PLAY_DAY: 2,
      /** Game ends after day 6 */
      LAST_DAY: 6
    };
    ReinforcementTable = {
      1: 1,
      2: 2,
      3: 2,
      4: 3,
      5: 3,
      6: 4
    };
    TieBreakers = {
      /** In initiative ties, Dictator wins */
      INITIATIVE: "dictator",
      /** In sector control ties, Dictator wins */
      SECTOR_CONTROL: "dictator",
      /** In victory point ties, Dictator wins */
      VICTORY_POINTS: "dictator"
    };
    AdjacencyConstants = {
      /** Movement directions: orthogonal only (up, down, left, right) */
      DIRECTIONS: [
        [-1, 0],
        // up
        [1, 0],
        // down
        [0, -1],
        // left
        [0, 1]
        // right
      ],
      /** No diagonal movement or placement */
      ALLOW_DIAGONAL: false
    };
    ExpansionConstants = {
      /** Base game component counts */
      BASE: {
        MERCS: 47,
        MAP_SECTORS: 16,
        EQUIPMENT: 69,
        DICTATORS: 2,
        DICTATOR_TACTICS: 10,
        PLAYER_COLORS: 4,
        MIN_REBELS: 2,
        MAX_REBELS: 4
      },
      /** Expansion additions */
      EXPANSION: {
        MERCS: 5,
        MAP_SECTORS: 14,
        EQUIPMENT: 58,
        DICTATORS: 9,
        DICTATOR_TACTICS: 4,
        PLAYER_COLORS: 3
      },
      /** Total with expansion */
      TOTAL: {
        MERCS: 52,
        MAP_SECTORS: 30,
        EQUIPMENT: 127,
        DICTATORS: 11,
        DICTATOR_TACTICS: 14,
        PLAYER_COLORS: 7,
        MIN_REBELS: 1,
        MAX_REBELS: 6
      }
    };
    GameConstants = {
      combat: CombatConstants,
      merc: MercConstants,
      sector: SectorConstants,
      team: TeamConstants,
      dictator: DictatorConstants,
      duration: GameDurationConstants,
      tieBreakers: TieBreakers,
      adjacency: AdjacencyConstants,
      expansion: ExpansionConstants
    };
  }
});

// src/rules/elements.ts
var MercCard, Equipment, Sector, DictatorCard, TacticsCard, Militia, Squad, MercDeck, EquipmentDeck, TacticsDeck, TacticsHand, DiscardPile, GameMap, PlayerArea;
var init_elements = __esm({
  "src/rules/elements.ts"() {
    "use strict";
    init_dist();
    init_constants();
    MercCard = class _MercCard extends Card {
      // Identity
      mercId;
      mercName;
      bio;
      ability;
      image;
      // Base skills (from card data)
      baseInitiative;
      baseTraining;
      baseCombat;
      // Current state
      damage = 0;
      actionsRemaining = 2;
      // Location tracking (used for dictator MERCs; rebel MERCs use Squad.sectorId)
      sectorId;
      // Equipment slots (references to equipped cards)
      weaponSlot;
      armorSlot;
      accessorySlot;
      // Constants (imported from game constants)
      static BASE_HEALTH = MercConstants.BASE_HEALTH;
      static BASE_TARGETS = MercConstants.BASE_TARGETS;
      static BASE_ARMOR = MercConstants.BASE_ARMOR;
      static BASE_ACTIONS = MercConstants.ACTIONS_PER_DAY;
      // Computed stats including equipment bonuses
      get initiative() {
        let value = this.baseInitiative;
        if (this.weaponSlot?.initiative) value += this.weaponSlot.initiative;
        if (this.armorSlot?.initiative) value += this.armorSlot.initiative;
        if (this.accessorySlot?.initiative) value += this.accessorySlot.initiative;
        return value;
      }
      get training() {
        let value = this.baseTraining;
        if (this.weaponSlot?.training) value += this.weaponSlot.training;
        if (this.armorSlot?.training) value += this.armorSlot.training;
        if (this.accessorySlot?.training) value += this.accessorySlot.training;
        return value;
      }
      get combat() {
        let value = this.baseCombat;
        if (this.weaponSlot?.combatBonus) value += this.weaponSlot.combatBonus;
        if (this.armorSlot?.combatBonus) value += this.armorSlot.combatBonus;
        if (this.accessorySlot?.combatBonus) value += this.accessorySlot.combatBonus;
        return Math.max(0, value);
      }
      get maxHealth() {
        if (this.mercId === "juicer") {
          return _MercCard.BASE_HEALTH + 2;
        }
        return _MercCard.BASE_HEALTH;
      }
      get health() {
        const calculatedHealth = this.maxHealth - this.damage;
        return calculatedHealth <= 0 ? 0 : calculatedHealth;
      }
      get targets() {
        let value = _MercCard.BASE_TARGETS;
        if (this.weaponSlot?.targets) value += this.weaponSlot.targets;
        if (this.armorSlot?.targets) value += this.armorSlot.targets;
        if (this.accessorySlot?.targets) value += this.accessorySlot.targets;
        return value;
      }
      get equipmentArmor() {
        let value = _MercCard.BASE_ARMOR;
        if (this.weaponSlot?.armorBonus) value += this.weaponSlot.armorBonus;
        if (this.armorSlot?.armorBonus) value += this.armorSlot.armorBonus;
        if (this.accessorySlot?.armorBonus) value += this.accessorySlot.armorBonus;
        return value;
      }
      get isDead() {
        return this.health <= 0;
      }
      get isFullyEquipped() {
        return !!(this.weaponSlot && this.armorSlot && this.accessorySlot);
      }
      takeDamage(amount) {
        const actualDamage = amount;
        this.damage = Math.min(this.damage + actualDamage, this.maxHealth);
        return actualDamage;
      }
      heal(amount) {
        const healed = Math.min(amount, this.damage);
        this.damage -= healed;
        return healed;
      }
      fullHeal() {
        this.damage = 0;
      }
      resetActions() {
        if (this.mercId === "ewok" || this.mercId === "faustina") {
          this.actionsRemaining = _MercCard.BASE_ACTIONS + 1;
        } else {
          this.actionsRemaining = _MercCard.BASE_ACTIONS;
        }
      }
      useAction(cost = 1) {
        if (this.actionsRemaining >= cost) {
          this.actionsRemaining -= cost;
          return true;
        }
        return false;
      }
      canEquip(equipment) {
        if (this.mercId === "apeiron") {
          const name = equipment.equipmentName.toLowerCase();
          if (name.includes("grenade") || name.includes("mortar")) {
            return false;
          }
        }
        if (this.mercId === "gunther" && equipment.equipmentType === "Accessory") {
          return !this.accessorySlot || !this.weaponSlot || !this.armorSlot;
        }
        if (this.mercId === "genesis" && equipment.equipmentType === "Weapon") {
          return !this.weaponSlot || !this.accessorySlot;
        }
        switch (equipment.equipmentType) {
          case "Weapon":
            return !this.weaponSlot;
          case "Armor":
            return !this.armorSlot;
          case "Accessory":
            return !this.accessorySlot;
          default:
            return false;
        }
      }
      equip(equipment) {
        let replaced;
        if (this.mercId === "gunther" && equipment.equipmentType === "Accessory") {
          if (!this.accessorySlot) {
            this.accessorySlot = equipment;
          } else if (!this.weaponSlot) {
            this.weaponSlot = equipment;
          } else if (!this.armorSlot) {
            this.armorSlot = equipment;
          } else {
            replaced = this.accessorySlot;
            this.accessorySlot = equipment;
          }
          return replaced;
        }
        if (this.mercId === "genesis" && equipment.equipmentType === "Weapon") {
          if (!this.weaponSlot) {
            this.weaponSlot = equipment;
          } else if (!this.accessorySlot) {
            this.accessorySlot = equipment;
          } else {
            replaced = this.weaponSlot;
            this.weaponSlot = equipment;
          }
          return replaced;
        }
        switch (equipment.equipmentType) {
          case "Weapon":
            replaced = this.weaponSlot;
            this.weaponSlot = equipment;
            break;
          case "Armor":
            replaced = this.armorSlot;
            this.armorSlot = equipment;
            break;
          case "Accessory":
            replaced = this.accessorySlot;
            this.accessorySlot = equipment;
            break;
        }
        return replaced;
      }
      unequip(type) {
        let equipment;
        switch (type) {
          case "Weapon":
            equipment = this.weaponSlot;
            this.weaponSlot = void 0;
            break;
          case "Armor":
            equipment = this.armorSlot;
            this.armorSlot = void 0;
            break;
          case "Accessory":
            equipment = this.accessorySlot;
            this.accessorySlot = void 0;
            break;
        }
        return equipment;
      }
      getEquipmentOfType(type) {
        switch (type) {
          case "Weapon":
            return this.weaponSlot;
          case "Armor":
            return this.armorSlot;
          case "Accessory":
            return this.accessorySlot;
          default:
            return void 0;
        }
      }
    };
    Equipment = class extends Card {
      equipmentId;
      equipmentName;
      equipmentType;
      serial;
      description;
      image;
      // Stat bonuses (can be negative)
      combatBonus = 0;
      initiative = 0;
      training = 0;
      targets = 0;
      armorBonus = 0;
      // Special properties
      negatesArmor = false;
      isOneUse = false;
      usesRemaining;
      // Damage state - damaged equipment cannot be stashed
      isDamaged = false;
      // Expansion marker (for special game modes)
      expansion;
      /**
       * Mark equipment as damaged (e.g., when absorbed damage)
       */
      damage() {
        this.isDamaged = true;
      }
      /**
       * Repair damaged equipment (e.g., at hospital or with repair kit)
       */
      repair() {
        this.isDamaged = false;
      }
      get isVehicle() {
        return this.expansion === "A";
      }
      get isIDictatorItem() {
        return this.expansion === "B";
      }
    };
    Sector = class _Sector extends GridCell {
      sectorId;
      sectorName;
      sectorType;
      value;
      image;
      // Loot icons (equipment drawn when explored)
      weaponLoot = 0;
      armorLoot = 0;
      accessoryLoot = 0;
      // State
      explored = false;
      // Militia counts per faction
      dictatorMilitia = 0;
      rebelMilitia = /* @__PURE__ */ new Map();
      // playerId -> count
      // Equipment stash
      stash = [];
      // Dictator base token
      isBase = false;
      // Constant (imported from game constants)
      static MAX_MILITIA_PER_SIDE = SectorConstants.MAX_MILITIA_PER_SIDE;
      get isCity() {
        return this.sectorType === "City";
      }
      get isIndustry() {
        return this.sectorType === "Industry";
      }
      get isWilderness() {
        return this.sectorType === "Wilderness";
      }
      get hasHospital() {
        return this.isCity;
      }
      get hasArmsDealer() {
        return this.isCity;
      }
      get totalLoot() {
        return this.weaponLoot + this.armorLoot + this.accessoryLoot;
      }
      getTotalRebelMilitia() {
        let total = 0;
        this.rebelMilitia.forEach((count) => total += count);
        return total;
      }
      getRebelMilitia(playerId) {
        return this.rebelMilitia.get(playerId) || 0;
      }
      /**
       * Add dictator militia to this sector.
       * @param count - Number of militia to add
       * @param bypassCap - If true, bypasses the normal 10 militia cap (for Kim's ability)
       * MERC-td6: Added bypassCap parameter for Kim's setup ability (max 20)
       */
      addDictatorMilitia(count, bypassCap = false) {
        if (bypassCap) {
          const kimMax = 20;
          const canAdd2 = Math.min(count, kimMax - this.dictatorMilitia);
          this.dictatorMilitia += canAdd2;
          return canAdd2;
        }
        const canAdd = Math.min(count, _Sector.MAX_MILITIA_PER_SIDE - this.dictatorMilitia);
        this.dictatorMilitia += canAdd;
        return canAdd;
      }
      addRebelMilitia(playerId, count) {
        const current = this.getRebelMilitia(playerId);
        const totalRebel = this.getTotalRebelMilitia();
        const canAdd = Math.min(count, _Sector.MAX_MILITIA_PER_SIDE - totalRebel);
        this.rebelMilitia.set(playerId, current + canAdd);
        return canAdd;
      }
      removeDictatorMilitia(count) {
        const removed = Math.min(count, this.dictatorMilitia);
        this.dictatorMilitia -= removed;
        return removed;
      }
      removeRebelMilitia(playerId, count) {
        const current = this.getRebelMilitia(playerId);
        const removed = Math.min(count, current);
        this.rebelMilitia.set(playerId, current - removed);
        return removed;
      }
      explore() {
        this.explored = true;
      }
      /**
       * Add equipment to sector stash.
       * Damaged equipment cannot be stashed - must be discarded instead.
       * @returns true if added, false if equipment was damaged
       */
      addToStash(equipment) {
        if (equipment.isDamaged) {
          return false;
        }
        this.stash.push(equipment);
        return true;
      }
      takeFromStash(index) {
        if (index >= 0 && index < this.stash.length) {
          return this.stash.splice(index, 1)[0];
        }
        return void 0;
      }
      /**
       * Find equipment in stash by type
       */
      findInStash(type) {
        return this.stash.find((e) => e.equipmentType === type);
      }
      /**
       * Get all equipment in stash
       */
      getStashContents() {
        return [...this.stash];
      }
    };
    DictatorCard = class _DictatorCard extends Card {
      dictatorId;
      dictatorName;
      ability;
      bio;
      image;
      // Stats (used when in play after base revealed)
      baseInitiative;
      baseTraining;
      baseCombat;
      // State
      damage = 0;
      actionsRemaining = 2;
      inPlay = false;
      // MERC-07j: Location tracking (like MercCard)
      sectorId;
      // Equipment slots
      weaponSlot;
      armorSlot;
      accessorySlot;
      // Constants (same as MercCard)
      static BASE_ACTIONS = MercConstants.ACTIONS_PER_DAY;
      // Constant (imported from game constants - Dictator uses same health as MERCs)
      static BASE_HEALTH = MercConstants.BASE_HEALTH;
      get maxHealth() {
        return _DictatorCard.BASE_HEALTH;
      }
      get health() {
        return this.maxHealth - this.damage;
      }
      get isDead() {
        return this.health <= 0;
      }
      get initiative() {
        let value = this.baseInitiative;
        if (this.weaponSlot?.initiative) value += this.weaponSlot.initiative;
        if (this.armorSlot?.initiative) value += this.armorSlot.initiative;
        if (this.accessorySlot?.initiative) value += this.accessorySlot.initiative;
        return value;
      }
      get training() {
        let value = this.baseTraining;
        if (this.weaponSlot?.training) value += this.weaponSlot.training;
        if (this.armorSlot?.training) value += this.armorSlot.training;
        if (this.accessorySlot?.training) value += this.accessorySlot.training;
        return value;
      }
      get combat() {
        let value = this.baseCombat;
        if (this.weaponSlot?.combatBonus) value += this.weaponSlot.combatBonus;
        if (this.armorSlot?.combatBonus) value += this.armorSlot.combatBonus;
        if (this.accessorySlot?.combatBonus) value += this.accessorySlot.combatBonus;
        return Math.max(0, value);
      }
      takeDamage(amount) {
        this.damage = Math.min(this.damage + amount, this.maxHealth);
        return amount;
      }
      enterPlay() {
        this.inPlay = true;
      }
      // MERC-07j: Action methods (matching MercCard interface)
      resetActions() {
        this.actionsRemaining = _DictatorCard.BASE_ACTIONS;
      }
      useAction(cost = 1) {
        if (this.actionsRemaining >= cost) {
          this.actionsRemaining -= cost;
          return true;
        }
        return false;
      }
      // MERC-07j: Equipment methods (matching MercCard interface)
      canEquip(equipment) {
        switch (equipment.equipmentType) {
          case "Weapon":
            return !this.weaponSlot;
          case "Armor":
            return !this.armorSlot;
          case "Accessory":
            return !this.accessorySlot;
          default:
            return false;
        }
      }
      equip(equipment) {
        let replaced;
        switch (equipment.equipmentType) {
          case "Weapon":
            replaced = this.weaponSlot;
            this.weaponSlot = equipment;
            break;
          case "Armor":
            replaced = this.armorSlot;
            this.armorSlot = equipment;
            break;
          case "Accessory":
            replaced = this.accessorySlot;
            this.accessorySlot = equipment;
            break;
        }
        return replaced;
      }
      unequip(type) {
        let equipment;
        switch (type) {
          case "Weapon":
            equipment = this.weaponSlot;
            this.weaponSlot = void 0;
            break;
          case "Armor":
            equipment = this.armorSlot;
            this.armorSlot = void 0;
            break;
          case "Accessory":
            equipment = this.accessorySlot;
            this.accessorySlot = void 0;
            break;
        }
        return equipment;
      }
      getEquipmentOfType(type) {
        switch (type) {
          case "Weapon":
            return this.weaponSlot;
          case "Armor":
            return this.armorSlot;
          case "Accessory":
            return this.accessorySlot;
          default:
            return void 0;
        }
      }
    };
    TacticsCard = class extends Card {
      tacticsId;
      tacticsName;
      story;
      description;
      get revealsBase() {
        return this.description.toLowerCase().includes("reveal your base");
      }
    };
    Militia = class _Militia extends Piece {
      // Fixed stats - militia always have the same values (from game constants)
      static INITIATIVE = CombatConstants.MILITIA_INITIATIVE;
      static COMBAT = CombatConstants.MILITIA_COMBAT;
      static HEALTH = CombatConstants.MILITIA_HEALTH;
      static ARMOR = CombatConstants.MILITIA_ARMOR;
      static TARGETS = CombatConstants.MILITIA_TARGETS;
      isDictator = false;
      ownerId;
      // For rebel militia, tracks which player owns them
      get initiative() {
        return _Militia.INITIATIVE;
      }
      get combat() {
        return _Militia.COMBAT;
      }
      // Militia die instantly when hit
      takeDamage(_amount) {
        return true;
      }
    };
    Squad = class extends Space {
      isPrimary = true;
      // Primary (large pawn) or Secondary (small pawn)
      sectorId;
      // Which sector this squad is in
      getMercs() {
        return this.all(MercCard);
      }
      get mercCount() {
        return this.count(MercCard);
      }
      get hasNoMercs() {
        return this.mercCount === 0;
      }
    };
    MercDeck = class extends Deck {
      // Deck of available MERCs to hire
    };
    EquipmentDeck = class extends Deck {
      equipmentType;
    };
    TacticsDeck = class extends Deck {
      // Dictator's tactics cards
    };
    TacticsHand = class extends Hand {
      // Dictator's hand of tactics cards (from game constants)
      static MAX_SIZE = DictatorConstants.HAND_SIZE;
    };
    DiscardPile = class extends Space {
      // Discard pile for any card type
    };
    GameMap = class extends Grid {
      // Tell AutoUI which properties to use for grid coordinates
      $rowCoord = "row";
      $colCoord = "col";
      // Labels for rows and columns (set dynamically based on grid size)
      $rowLabels = [];
      $columnLabels = [];
      rows;
      cols;
      /**
       * Update the row/column labels based on current grid dimensions
       */
      updateLabels() {
        this.$rowLabels = Array.from({ length: this.rows }, (_, i) => String(i));
        this.$columnLabels = Array.from({ length: this.cols }, (_, i) => String(i));
      }
      getSector(row, col) {
        return this.first(Sector, (s) => s.row === row && s.col === col);
      }
      getAllSectors() {
        return this.all(Sector);
      }
      getAdjacentSectors(sector2) {
        const adjacent = [];
        for (const [dr, dc] of AdjacencyConstants.DIRECTIONS) {
          const neighbor = this.getSector(sector2.row + dr, sector2.col + dc);
          if (neighbor) {
            adjacent.push(neighbor);
          }
        }
        return adjacent;
      }
      isEdgeSector(sector2) {
        return sector2.row === 0 || sector2.row === this.rows - 1 || sector2.col === 0 || sector2.col === this.cols - 1;
      }
      getEdgeSectors() {
        return this.getAllSectors().filter((s) => this.isEdgeSector(s));
      }
    };
    PlayerArea = class extends Space {
      // Contains the player's squads, hired MERCs, etc.
    };
  }
});

// src/rules/ai-helpers.ts
var ai_helpers_exports = {};
__export(ai_helpers_exports, {
  autoEquipDictatorUnits: () => autoEquipDictatorUnits,
  calculateRebelStrength: () => calculateRebelStrength,
  canDictatorMove: () => canDictatorMove,
  canSquadMoveTogether: () => canSquadMoveTogether,
  chooseWeakestRebelSector: () => chooseWeakestRebelSector,
  countTargetsInSector: () => countTargetsInSector,
  detonateLandMines: () => detonateLandMines,
  distanceBetweenSectors: () => distanceBetweenSectors,
  distanceToNearestRebel: () => distanceToNearestRebel,
  distributeExtraMilitiaEvenly: () => distributeExtraMilitiaEvenly,
  findClosestRebelSector: () => findClosestRebelSector,
  findNearestHospital: () => findNearestHospital,
  findUnoccupiedIndustriesInRange: () => findUnoccupiedIndustriesInRange,
  getAIAbilityActivations: () => getAIAbilityActivations,
  getAIFreeEquipmentType: () => getAIFreeEquipmentType,
  getAIHealingPriority: () => getAIHealingPriority,
  getAIMercAction: () => getAIMercAction,
  getAIMercActionPriority: () => getAIMercActionPriority,
  getBestMoveDirection: () => getBestMoveDirection,
  getDictatorBaseActions: () => getDictatorBaseActions,
  getMercsWithHealingAbility: () => getMercsWithHealingAbility,
  getMortarTargets: () => getMortarTargets,
  getMostDamagedMerc: () => getMostDamagedMerc,
  getPrivacyPlayer: () => getPrivacyPlayer,
  getRebelControlledSectors: () => getRebelControlledSectors,
  getSquadAction: () => getSquadAction,
  getSquadMercs: () => getSquadMercs,
  getUnitsWithAttackDogs: () => getUnitsWithAttackDogs,
  hasAttackDog: () => hasAttackDog,
  hasEpinephrineShot: () => hasEpinephrineShot,
  hasMortar: () => hasMortar,
  hasRepairKit: () => hasRepairKit,
  isDictatorAtBase: () => isDictatorAtBase,
  isPrivacyPlayer: () => isPrivacyPlayer,
  mercNeedsHealing: () => mercNeedsHealing,
  selectAIBaseLocation: () => selectAIBaseLocation,
  selectAIMercForHiring: () => selectAIMercForHiring,
  selectAIMercsForHiring: () => selectAIMercsForHiring,
  selectAttackDogTarget: () => selectAttackDogTarget,
  selectMilitiaPlacementSector: () => selectMilitiaPlacementSector,
  selectMortarTarget: () => selectMortarTarget,
  selectNewMercLocation: () => selectNewMercLocation,
  setPrivacyPlayer: () => setPrivacyPlayer,
  shouldLeaveInStash: () => shouldLeaveInStash,
  shouldSkipExtraMilitia: () => shouldSkipExtraMilitia,
  shouldUseEpinephrine: () => shouldUseEpinephrine,
  shouldUseSpecialAbility: () => shouldUseSpecialAbility,
  sortEquipmentByAIPriority: () => sortEquipmentByAIPriority,
  sortMercsAlphabetically: () => sortMercsAlphabetically,
  sortMercsByInitiative: () => sortMercsByInitiative,
  sortTargetsByAIPriority: () => sortTargetsByAIPriority,
  useRepairKit: () => useRepairKit
});
function calculateRebelStrength(game, sector2) {
  let total = 0;
  for (const rebel of game.rebelPlayers) {
    if (rebel.primarySquad?.sectorId === sector2.sectorId) {
      for (const merc of rebel.primarySquad.getMercs()) {
        total += merc.health + merc.equipmentArmor;
      }
    }
    if (rebel.secondarySquad?.sectorId === sector2.sectorId) {
      for (const merc of rebel.secondarySquad.getMercs()) {
        total += merc.health + merc.equipmentArmor;
      }
    }
    const militia = sector2.getRebelMilitia(`${rebel.position}`);
    total += militia;
  }
  return total;
}
function chooseWeakestRebelSector(game, sectors) {
  if (sectors.length === 0) return null;
  if (sectors.length === 1) return sectors[0];
  const sectorsWithStrength = sectors.map((s) => ({
    sector: s,
    strength: calculateRebelStrength(game, s)
  }));
  const minStrength = Math.min(...sectorsWithStrength.map((s) => s.strength));
  const weakest = sectorsWithStrength.filter((s) => s.strength === minStrength);
  if (weakest.length > 1) {
    const randomIndex = Math.floor(Math.random() * weakest.length);
    return weakest[randomIndex].sector;
  }
  return weakest[0].sector;
}
function getRebelControlledSectors(game) {
  const rebelSectors = [];
  for (const rebel of game.rebelPlayers) {
    const controlled = game.getControlledSectors(rebel);
    for (const sector2 of controlled) {
      if (!rebelSectors.some((s) => s.sectorId === sector2.sectorId)) {
        rebelSectors.push(sector2);
      }
    }
  }
  return rebelSectors;
}
function distanceToNearestRebel(game, sector2) {
  const rebelSectors = getRebelControlledSectors(game);
  if (rebelSectors.length === 0) return Infinity;
  if (rebelSectors.some((r) => r.sectorId === sector2.sectorId)) {
    return 0;
  }
  const visited = /* @__PURE__ */ new Set([sector2.sectorId]);
  const queue = [{ sector: sector2, distance: 0 }];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const adjacent of game.getAdjacentSectors(current.sector)) {
      if (visited.has(adjacent.sectorId)) continue;
      visited.add(adjacent.sectorId);
      if (rebelSectors.some((r) => r.sectorId === adjacent.sectorId)) {
        return current.distance + 1;
      }
      queue.push({ sector: adjacent, distance: current.distance + 1 });
    }
  }
  return Infinity;
}
function distanceBetweenSectors(game, from, to) {
  if (from.sectorId === to.sectorId) return 0;
  const visited = /* @__PURE__ */ new Set([from.sectorId]);
  const queue = [{ sector: from, distance: 0 }];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const adjacent of game.getAdjacentSectors(current.sector)) {
      if (visited.has(adjacent.sectorId)) continue;
      visited.add(adjacent.sectorId);
      if (adjacent.sectorId === to.sectorId) {
        return current.distance + 1;
      }
      queue.push({ sector: adjacent, distance: current.distance + 1 });
    }
  }
  return Infinity;
}
function sortTargetsByAIPriority(targets) {
  return [...targets].sort((a, b) => {
    const survA = a.health + a.armor;
    const survB = b.health + b.armor;
    if (survA !== survB) return survA - survB;
    if (a.targets !== b.targets) return b.targets - a.targets;
    if (a.initiative !== b.initiative) return b.initiative - a.initiative;
    return Math.random() - 0.5;
  });
}
function isPrivacyPlayer(game, playerId) {
  return game.dictatorPlayer.privacyPlayerId === playerId;
}
function getPrivacyPlayer(game) {
  const privacyId = game.dictatorPlayer.privacyPlayerId;
  if (!privacyId) return null;
  const rebel = game.rebelPlayers.find((r) => r.position.toString() === privacyId);
  if (rebel) {
    return { name: rebel.name, position: rebel.position };
  }
  return null;
}
function setPrivacyPlayer(game, playerId) {
  game.dictatorPlayer.privacyPlayerId = playerId;
  game.message(`Player ${playerId} designated as Privacy Player for AI decisions`);
}
function canDictatorMove(game) {
  if (!game.dictatorPlayer.baseRevealed) {
    return false;
  }
  return false;
}
function isDictatorAtBase(game) {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator || !dictator.inPlay) return false;
  const baseSectorId = game.dictatorPlayer.baseSectorId;
  return dictator.sectorId === baseSectorId;
}
function getDictatorBaseActions() {
  return ["explore", "re-equip", "train"];
}
function selectAIBaseLocation(game) {
  const controlledIndustries = game.gameMap.getAllSectors().filter((s) => s.isIndustry && s.dictatorMilitia > 0);
  if (controlledIndustries.length === 0) {
    const anyControlled = game.gameMap.getAllSectors().filter((s) => s.dictatorMilitia > 0);
    if (anyControlled.length === 0) return null;
    return anyControlled[0];
  }
  if (controlledIndustries.length === 1) {
    return controlledIndustries[0];
  }
  const sorted = [...controlledIndustries].sort((a, b) => {
    const distA = distanceToNearestRebel(game, a);
    const distB = distanceToNearestRebel(game, b);
    if (distA !== distB) return distB - distA;
    if (a.dictatorMilitia !== b.dictatorMilitia) {
      return b.dictatorMilitia - a.dictatorMilitia;
    }
    if (a.industryValue !== b.industryValue) {
      return (b.industryValue || 0) - (a.industryValue || 0);
    }
    return Math.random() - 0.5;
  });
  return sorted[0];
}
function shouldSkipExtraMilitia(game) {
  return game.rebelPlayers.length <= 1;
}
function distributeExtraMilitiaEvenly(game, totalMilitia) {
  const placements = /* @__PURE__ */ new Map();
  if (shouldSkipExtraMilitia(game)) {
    game.message("Solo game: skipping extra militia");
    return placements;
  }
  const dictatorIndustries = game.gameMap.getAllSectors().filter(
    (s) => s.isIndustry && s.dictatorMilitia > 0
  );
  if (dictatorIndustries.length === 0 || totalMilitia === 0) {
    return placements;
  }
  const basePerSector = Math.floor(totalMilitia / dictatorIndustries.length);
  let remainder = totalMilitia % dictatorIndustries.length;
  const sortedIndustries = [...dictatorIndustries].sort(
    (a, b) => (b.industryValue || 0) - (a.industryValue || 0)
  );
  for (const sector2 of sortedIndustries) {
    let toPlace = basePerSector;
    if (remainder > 0) {
      toPlace++;
      remainder--;
    }
    if (toPlace > 0) {
      const placed = sector2.addDictatorMilitia(toPlace);
      if (placed > 0) {
        placements.set(sector2.sectorId, placed);
        game.message(`Placed ${placed} extra militia at ${sector2.sectorName}`);
      }
    }
  }
  return placements;
}
function selectMilitiaPlacementSector(game, allowedSectors, placementType) {
  if (allowedSectors.length === 0) return null;
  if (allowedSectors.length === 1) return allowedSectors[0];
  switch (placementType) {
    case "rebel":
      return chooseWeakestRebelSector(game, allowedSectors);
    case "neutral":
      const baseSector = game.dictatorPlayer.baseSectorId ? game.getSector(game.dictatorPlayer.baseSectorId) : null;
      const dictatorSectors = game.gameMap.getAllSectors().filter((s) => s.dictatorMilitia > 0);
      return [...allowedSectors].sort((a, b) => {
        let distA = baseSector ? distanceBetweenSectors(game, a, baseSector) : Infinity;
        let distB = baseSector ? distanceBetweenSectors(game, b, baseSector) : Infinity;
        if (!baseSector && dictatorSectors.length > 0) {
          distA = Math.min(...dictatorSectors.map((d) => distanceBetweenSectors(game, a, d)));
          distB = Math.min(...dictatorSectors.map((d) => distanceBetweenSectors(game, b, d)));
        }
        if (distA !== distB) return distA - distB;
        return (b.industryValue || 0) - (a.industryValue || 0);
      })[0];
    case "dictator":
      return [...allowedSectors].sort((a, b) => {
        const distA = distanceToNearestRebel(game, a);
        const distB = distanceToNearestRebel(game, b);
        return distA - distB;
      })[0];
    default:
      return allowedSectors[0];
  }
}
function shouldLeaveInStash(equipment) {
  const name = equipment.equipmentName.toLowerCase();
  return name.includes("land mine") || name.includes("repair kit");
}
function sortEquipmentByAIPriority(equipment) {
  return [...equipment].filter((e) => !shouldLeaveInStash(e)).sort((a, b) => (b.serial || 0) - (a.serial || 0));
}
function sortMercsAlphabetically(mercs) {
  return [...mercs].sort((a, b) => a.mercName.localeCompare(b.mercName));
}
function getAIFreeEquipmentType() {
  return "Weapon";
}
function selectAIMercForHiring(availableMercs) {
  if (availableMercs.length === 0) return -1;
  if (availableMercs.length === 1) return 0;
  return Math.floor(Math.random() * availableMercs.length);
}
function selectAIMercsForHiring(availableMercs, countToSelect) {
  if (availableMercs.length === 0 || countToSelect <= 0) return [];
  const indices = [];
  const available = availableMercs.map((_, i) => i);
  for (let i = 0; i < Math.min(countToSelect, availableMercs.length); i++) {
    const randomIdx = Math.floor(Math.random() * available.length);
    indices.push(available[randomIdx]);
    available.splice(randomIdx, 1);
  }
  return indices;
}
function selectNewMercLocation(game) {
  const dictatorSectors = game.gameMap.getAllSectors().filter((s) => s.dictatorMilitia > 0);
  if (dictatorSectors.length === 0) return null;
  if (dictatorSectors.length === 1) return dictatorSectors[0];
  const rebelSectors = getRebelControlledSectors(game);
  if (rebelSectors.length === 0) {
    return dictatorSectors.sort((a, b) => b.dictatorMilitia - a.dictatorMilitia)[0];
  }
  const weakestRebel = chooseWeakestRebelSector(game, rebelSectors);
  if (!weakestRebel) return dictatorSectors[0];
  return dictatorSectors.sort((a, b) => {
    const distA = distanceBetweenSectors(game, a, weakestRebel);
    const distB = distanceBetweenSectors(game, b, weakestRebel);
    return distA - distB;
  })[0];
}
function detonateLandMines(game, sector2, attackingPlayer) {
  if (sector2.dictatorMilitia === 0 && !game.dictatorPlayer.hiredMercs.some((m) => m.sectorId === sector2.sectorId)) {
    return { detonated: 0, damageDealt: 0 };
  }
  const stash = sector2.getStashContents();
  const landMines = stash.filter((e) => e.equipmentName.toLowerCase().includes("land mine"));
  if (landMines.length === 0) {
    return { detonated: 0, damageDealt: 0 };
  }
  const mine = landMines[0];
  const idx = stash.indexOf(mine);
  sector2.takeFromStash(idx);
  let damageDealt = 0;
  for (const rebel of game.rebelPlayers) {
    const mercsInSector = game.getMercsInSector(sector2, rebel);
    for (const merc of mercsInSector) {
      merc.takeDamage(1);
      damageDealt++;
      game.message(`Land mine deals 1 damage to ${merc.mercName}`);
    }
  }
  for (const rebel of game.rebelPlayers) {
    const militia = sector2.getRebelMilitia(`${rebel.position}`);
    if (militia > 0) {
      sector2.removeRebelMilitia(`${rebel.position}`, 1);
      damageDealt++;
      game.message(`Land mine kills 1 of ${rebel.name}'s militia`);
    }
  }
  const discard = game.getEquipmentDiscard("Accessory");
  if (discard) {
    mine.putInto(discard);
  }
  game.message(`Dictator detonates land mine at ${sector2.sectorName}!`);
  return { detonated: 1, damageDealt };
}
function autoEquipDictatorUnits(game, sector2) {
  const units = game.dictatorPlayer.hiredMercs.filter((m) => m.sectorId === sector2.sectorId);
  if (game.dictatorPlayer.dictator?.inPlay && game.dictatorPlayer.dictator.sectorId === sector2.sectorId) {
    units.push(game.dictatorPlayer.dictator);
  }
  if (units.length === 0) return 0;
  const sortedUnits = units.sort((a, b) => {
    const nameA = a instanceof MercCard ? a.mercName : "ZZZZZ";
    const nameB = b instanceof MercCard ? b.mercName : "ZZZZZ";
    return nameA.localeCompare(nameB);
  });
  const stash = sector2.getStashContents();
  const prioritizedEquipment = sortEquipmentByAIPriority(stash);
  let equippedCount = 0;
  for (const unit of sortedUnits) {
    for (const equipment of prioritizedEquipment) {
      if (!sector2.getStashContents().includes(equipment)) continue;
      if (!unit.canEquip(equipment.equipmentType)) continue;
      const current = unit.getEquipmentOfType(equipment.equipmentType);
      if (current) {
        if ((equipment.serial || 0) <= (current.serial || 0)) continue;
        unit.unequip(equipment.equipmentType);
        sector2.addToStash(current);
      }
      const stashIdx = sector2.getStashContents().indexOf(equipment);
      if (stashIdx >= 0) {
        sector2.takeFromStash(stashIdx);
      }
      unit.equip(equipment);
      equippedCount++;
      if (unit instanceof MercCard) {
        game.message(`${unit.mercName} equipped ${equipment.equipmentName}`);
      } else {
        game.message(`Dictator equipped ${equipment.equipmentName}`);
      }
    }
  }
  return equippedCount;
}
function sortMercsByInitiative(mercs) {
  return [...mercs].sort((a, b) => {
    if (a.initiative !== b.initiative) {
      return b.initiative - a.initiative;
    }
    return a.mercName.localeCompare(b.mercName);
  });
}
function getSquadMercs(game) {
  const mercs = game.dictatorPlayer.hiredMercs.filter((m) => !m.isDead && m.sectorId);
  return sortMercsByInitiative(mercs);
}
function canSquadMoveTogether(game, fromSectorId) {
  const mercsInSector = game.dictatorPlayer.hiredMercs.filter(
    (m) => m.sectorId === fromSectorId && !m.isDead
  );
  return mercsInSector.every((m) => m.actionsRemaining > 0);
}
function getSquadAction(game) {
  const mercs = getSquadMercs(game);
  if (mercs.length === 0) {
    return { action: "move", reason: "No MERCs available", mercs: [] };
  }
  const sector2 = mercs[0].sectorId ? game.getSector(mercs[0].sectorId) : null;
  if (!sector2) {
    return { action: "move", reason: "No sector", mercs };
  }
  const decision = getAIMercAction(game, mercs[0]);
  if (decision.action === "move" && decision.target) {
    const canMove = canSquadMoveTogether(game, sector2.sectorId);
    if (!canMove) {
      if (sector2.dictatorMilitia < 10 && mercs.some((m) => m.training > 0)) {
        return { action: "train", reason: "MERC-1gu: Squad cannot move together, train instead", mercs };
      }
    }
  }
  return { ...decision, mercs };
}
function isMercFullyEquipped(merc) {
  return merc.isFullyEquipped;
}
function isUndefendedIndustry(sector2) {
  return sector2.isIndustry && sector2.dictatorMilitia === 0;
}
function findUnoccupiedIndustriesInRange(game, fromSector) {
  const allSectors = game.gameMap.getAllSectors();
  return allSectors.filter((s) => {
    if (!s.isIndustry) return false;
    if (s.dictatorMilitia > 0) return false;
    if (s.getTotalRebelMilitia() > 0) return false;
    const hasSquads = game.rebelPlayers.some(
      (r) => r.primarySquad?.sectorId === s.sectorId || r.secondarySquad?.sectorId === s.sectorId
    );
    if (hasSquads) return false;
    const dist = distanceBetweenSectors(game, fromSector, s);
    return dist <= 2;
  });
}
function isRebelInRange(game, fromSector) {
  const rebelSectors = getRebelControlledSectors(game);
  for (const rebelSector of rebelSectors) {
    const dist = distanceBetweenSectors(game, fromSector, rebelSector);
    if (dist <= 2) return true;
  }
  return false;
}
function getAIMercAction(game, merc) {
  const sector2 = merc.sectorId ? game.getSector(merc.sectorId) : null;
  if (!sector2) {
    return { action: "move", reason: "No sector" };
  }
  if (!isMercFullyEquipped(merc)) {
    if (!sector2.explored) {
      return { action: "explore", reason: "3.1: Not fully equipped, explore sector" };
    }
    const stash = sector2.getStashContents();
    const usableEquipment = stash.filter((e) => !shouldLeaveInStash(e));
    if (usableEquipment.length > 0) {
      return { action: "re-equip", reason: "3.1: Not fully equipped, equip from stash" };
    }
  }
  if (isUndefendedIndustry(sector2) && merc.training > 0) {
    return { action: "train", reason: "3.2: On undefended industry, train militia" };
  }
  const unoccupiedIndustries = findUnoccupiedIndustriesInRange(game, sector2);
  if (unoccupiedIndustries.length > 0) {
    const closest = unoccupiedIndustries.sort(
      (a, b) => distanceBetweenSectors(game, sector2, a) - distanceBetweenSectors(game, sector2, b)
    )[0];
    return { action: "move", target: closest, reason: "3.3: Move to unoccupied industry" };
  }
  if (isRebelInRange(game, sector2)) {
    const target2 = getBestMoveDirection(game, sector2);
    if (target2) {
      return { action: "move", target: target2, reason: "3.4: Rebel in range, move toward" };
    }
  }
  if (sector2.dictatorMilitia < 10 && merc.training > 0) {
    return { action: "train", reason: "3.5: Militia < 10, train" };
  }
  const target = getBestMoveDirection(game, sector2);
  if (target) {
    return { action: "move", target, reason: "3.6: Default, move toward rebel" };
  }
  if (merc.training > 0 && sector2.dictatorMilitia < 10) {
    return { action: "train", reason: "Fallback: train militia" };
  }
  return { action: "move", reason: "No action available" };
}
function getAIMercActionPriority(game, merc) {
  const decision = getAIMercAction(game, merc);
  return [decision.action];
}
function findClosestRebelSector(game, fromSector) {
  const rebelSectors = getRebelControlledSectors(game);
  if (rebelSectors.length === 0) return null;
  const sorted = [...rebelSectors].sort((a, b) => {
    const distA = distanceBetweenSectors(game, fromSector, a);
    const distB = distanceBetweenSectors(game, fromSector, b);
    if (distA !== distB) return distA - distB;
    const strengthA = calculateRebelStrength(game, a);
    const strengthB = calculateRebelStrength(game, b);
    if (strengthA !== strengthB) return strengthA - strengthB;
    return Math.random() - 0.5;
  });
  return sorted[0];
}
function getBestMoveDirection(game, fromSector) {
  const adjacent = game.getAdjacentSectors(fromSector);
  if (adjacent.length === 0) return null;
  const rebelSectors = getRebelControlledSectors(game);
  if (rebelSectors.length === 0) {
    return null;
  }
  const closestRebel = findClosestRebelSector(game, fromSector);
  if (!closestRebel) return null;
  return [...adjacent].sort((a, b) => {
    const distA = distanceBetweenSectors(game, a, closestRebel);
    const distB = distanceBetweenSectors(game, b, closestRebel);
    return distA - distB;
  })[0];
}
function mercNeedsHealing(merc) {
  return merc.damage > 0 && !merc.isDead;
}
function getMercsWithHealingAbility(mercs) {
  return mercs.filter(
    (m) => !m.isDead && m.ability && (m.ability.toLowerCase().includes("heal") || m.ability.toLowerCase().includes("medical") || m.ability.toLowerCase().includes("restore"))
  );
}
function getAIHealingPriority(game, damagedMercs, allMercs) {
  if (damagedMercs.length === 0) return null;
  const sortedDamaged = [...damagedMercs].sort((a, b) => a.health - b.health);
  const target = sortedDamaged[0];
  const healers = getMercsWithHealingAbility(allMercs);
  if (healers.length > 0) {
    return { type: "ability", merc: healers[0], target };
  }
  for (const merc of allMercs) {
    const accessory = merc.accessorySlot;
    if (accessory) {
      const name = accessory.equipmentName.toLowerCase();
      if (name.includes("medical kit") || name.includes("first aid kit")) {
        return { type: "item", merc, item: accessory.equipmentName, target };
      }
    }
  }
  if (target.sectorId) {
    const sector2 = game.getSector(target.sectorId);
    if (sector2 && hasRepairKit(sector2)) {
      return { type: "repairKit", target, sector: sector2 };
    }
  }
  return null;
}
function hasEpinephrineShot(mercs) {
  for (const merc of mercs) {
    const accessory = merc.accessorySlot;
    if (accessory?.equipmentName.toLowerCase().includes("epinephrine")) {
      return merc;
    }
  }
  return null;
}
function shouldUseEpinephrine(dyingMerc, squadMercs) {
  if (dyingMerc.health > 0 || dyingMerc.isDead) return null;
  return hasEpinephrineShot(squadMercs);
}
function shouldUseSpecialAbility(merc, _situation) {
  return !!merc.ability && merc.ability.length > 0;
}
function getAIAbilityActivations(mercs) {
  return mercs.filter((m) => !m.isDead && shouldUseSpecialAbility(m, "any"));
}
function hasAttackDog(unit) {
  const accessory = unit.accessorySlot;
  return accessory?.equipmentName.toLowerCase().includes("attack dog") ?? false;
}
function getUnitsWithAttackDogs(mercs) {
  return mercs.filter((m) => !m.isDead && hasAttackDog(m));
}
function selectAttackDogTarget(targets) {
  if (targets.length === 0) return null;
  const sorted = sortTargetsByAIPriority(targets);
  return sorted[0];
}
function hasRepairKit(sector2) {
  return sector2.getStashContents().some(
    (e) => e.equipmentName.toLowerCase().includes("repair kit")
  );
}
function useRepairKit(game, sector2, merc) {
  const stash = sector2.getStashContents();
  const repairKitIdx = stash.findIndex(
    (e) => e.equipmentName.toLowerCase().includes("repair kit")
  );
  if (repairKitIdx < 0) return false;
  const repairKit = sector2.takeFromStash(repairKitIdx);
  if (!repairKit) return false;
  const healed = merc.damage;
  merc.fullHeal();
  const discard = game.getEquipmentDiscard("Accessory");
  if (discard) {
    repairKit.putInto(discard);
  }
  game.message(`${merc.mercName} used Repair Kit and healed ${healed} damage`);
  return true;
}
function getMostDamagedMerc(mercs) {
  const damaged = mercs.filter((m) => m.damage > 0 && !m.isDead);
  if (damaged.length === 0) return null;
  return damaged.sort((a, b) => {
    if (a.health !== b.health) return a.health - b.health;
    return a.mercName.localeCompare(b.mercName);
  })[0];
}
function findNearestHospital(game, fromSector) {
  const visited = /* @__PURE__ */ new Set([fromSector.sectorId]);
  const queue = [{ sector: fromSector, distance: 0 }];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current.sector.isCity && current.distance > 0) {
      return current.sector;
    }
    for (const adjacent of game.getAdjacentSectors(current.sector)) {
      if (visited.has(adjacent.sectorId)) continue;
      visited.add(adjacent.sectorId);
      queue.push({ sector: adjacent, distance: current.distance + 1 });
    }
  }
  return null;
}
function hasMortar(unit) {
  const weapon = unit.weaponSlot;
  return weapon?.equipmentName.toLowerCase().includes("mortar") ?? false;
}
function getMortarTargets(game, fromSector) {
  const adjacent = game.getAdjacentSectors(fromSector);
  return adjacent.filter((sector2) => {
    const hasRebelMercs = game.rebelPlayers.some(
      (r) => r.primarySquad?.sectorId === sector2.sectorId || r.secondarySquad?.sectorId === sector2.sectorId
    );
    const hasRebelMilitia = sector2.getTotalRebelMilitia() > 0;
    return hasRebelMercs || hasRebelMilitia;
  });
}
function countTargetsInSector(game, sector2) {
  let count = 0;
  for (const rebel of game.rebelPlayers) {
    if (rebel.primarySquad?.sectorId === sector2.sectorId) {
      count += rebel.primarySquad.getMercs().filter((m) => !m.isDead).length;
    }
    if (rebel.secondarySquad?.sectorId === sector2.sectorId) {
      count += rebel.secondarySquad.getMercs().filter((m) => !m.isDead).length;
    }
  }
  count += sector2.getTotalRebelMilitia();
  return count;
}
function selectMortarTarget(game, fromSector) {
  const targets = getMortarTargets(game, fromSector);
  if (targets.length === 0) return null;
  const sortedTargets = [...targets].sort((a, b) => {
    const countA = countTargetsInSector(game, a);
    const countB = countTargetsInSector(game, b);
    if (countA !== countB) return countB - countA;
    const strengthA = calculateRebelStrength(game, a);
    const strengthB = calculateRebelStrength(game, b);
    if (strengthA !== strengthB) return strengthA - strengthB;
    return Math.random() - 0.5;
  });
  return sortedTargets[0];
}
var init_ai_helpers = __esm({
  "src/rules/ai-helpers.ts"() {
    "use strict";
    init_elements();
  }
});

// src/rules/game.ts
init_dist();
init_elements();

// src/rules/flow.ts
init_dist();

// src/rules/day-one.ts
init_elements();
init_constants();

// src/rules/dictator-abilities.ts
init_ai_helpers();
function applyKimSetupAbility(game) {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator || dictator.dictatorId !== "kim") {
    return { success: false, message: "Not Kim" };
  }
  game.dictatorPlayer.baseRevealed = true;
  const militiaCount = Math.min(5 * game.rebelCount, 20);
  const baseSector = game.getSector(game.dictatorPlayer.baseSectorId);
  if (baseSector) {
    const placed = baseSector.addDictatorMilitia(militiaCount, true);
    game.message(`Kim's base is revealed with ${placed} militia!`);
    return {
      success: true,
      message: `Base revealed with ${placed} militia`,
      data: { militiaPlaced: placed }
    };
  }
  return { success: false, message: "No base sector found" };
}
function applyCastroTurnAbility(game) {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator || dictator.dictatorId !== "castro") {
    return { success: false, message: "Not Castro" };
  }
  const drawnMercs = [];
  for (let i = 0; i < 3; i++) {
    const merc = game.drawMerc();
    if (merc) {
      drawnMercs.push(merc);
    }
  }
  if (drawnMercs.length === 0) {
    game.message("Castro: No MERCs available to hire");
    return { success: false, message: "No MERCs available" };
  }
  const bestMerc = drawnMercs.reduce(
    (best, current) => current.baseCombat > best.baseCombat ? current : best
  );
  game.dictatorPlayer.hiredMercs.push(bestMerc);
  const targetSector = selectNewMercLocation(game);
  if (targetSector) {
    bestMerc.sectorId = targetSector.sectorId;
  }
  for (const merc of drawnMercs) {
    if (merc !== bestMerc) {
      merc.putInto(game.mercDiscard);
    }
  }
  game.message(`Castro hired ${bestMerc.mercName} (chose from ${drawnMercs.length} MERCs)`);
  return {
    success: true,
    message: `Hired ${bestMerc.mercName}`,
    data: { hiredMerc: bestMerc.mercName }
  };
}
function applyKimTurnAbility(game) {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator || dictator.dictatorId !== "kim") {
    return { success: false, message: "Not Kim" };
  }
  let rebelSectorCount = 0;
  for (const rebel of game.rebelPlayers) {
    rebelSectorCount += game.getControlledSectors(rebel).length;
  }
  if (rebelSectorCount === 0) {
    game.message("Kim: Rebels control no sectors, no militia to place");
    return { success: true, message: "No rebel sectors", data: { militiaPlaced: 0 } };
  }
  const allSectors = game.gameMap.getAllSectors();
  const rebelSectors = getRebelControlledSectors(game);
  const dictatorSectors = allSectors.filter((s) => s.dictatorMilitia > 0);
  const neutralSectors = allSectors.filter(
    (s) => s.dictatorMilitia === 0 && s.getTotalRebelMilitia() === 0 && !game.rebelPlayers.some(
      (r) => r.primarySquad?.sectorId === s.sectorId || r.secondarySquad?.sectorId === s.sectorId
    )
  );
  let targetSector = null;
  if (rebelSectors.length > 0) {
    targetSector = selectMilitiaPlacementSector(game, rebelSectors, "rebel");
  } else if (neutralSectors.length > 0) {
    targetSector = selectMilitiaPlacementSector(game, neutralSectors, "neutral");
  } else if (dictatorSectors.length > 0) {
    targetSector = selectMilitiaPlacementSector(game, dictatorSectors, "dictator");
  }
  if (!targetSector) {
    const industries = allSectors.filter((s) => s.isIndustry);
    targetSector = industries[0] || allSectors[0];
  }
  const placed = targetSector.addDictatorMilitia(rebelSectorCount);
  game.message(`Kim placed ${placed} militia at ${targetSector.sectorName} (rebels control ${rebelSectorCount} sectors)`);
  return {
    success: true,
    message: `Placed ${placed} militia`,
    data: { militiaPlaced: placed, targetSector: targetSector.sectorName }
  };
}
function applyDictatorSetupAbilities(game) {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator) return;
  switch (dictator.dictatorId) {
    case "kim":
      applyKimSetupAbility(game);
      break;
    case "castro":
      game.message(`Castro's ability: ${dictator.ability}`);
      break;
    default:
      game.message(`Dictator ability: ${dictator.ability}`);
  }
}
function applyDictatorTurnAbilities(game) {
  const dictator = game.dictatorPlayer.dictator;
  if (!dictator) return;
  switch (dictator.dictatorId) {
    case "castro":
      applyCastroTurnAbility(game);
      break;
    case "kim":
      applyKimTurnAbility(game);
      break;
    default:
      break;
  }
}

// src/rules/day-one.ts
init_ai_helpers();
function drawMercsForHiring(game, count = 3) {
  const drawnMercs = [];
  for (let i = 0; i < count; i++) {
    const merc = game.drawMerc();
    if (merc) {
      drawnMercs.push(merc);
    }
  }
  return drawnMercs;
}
function hireSelectedMercs(game, player, drawnMercs, selectedIndices) {
  const hiredMercs = [];
  for (let i = 0; i < drawnMercs.length; i++) {
    const merc = drawnMercs[i];
    if (selectedIndices.includes(i)) {
      merc.putInto(player.primarySquad);
      hiredMercs.push(merc);
      game.message(`${player.name} hired ${merc.mercName}`);
    } else {
      merc.putInto(game.mercDiscard);
    }
  }
  return hiredMercs;
}
function isValidLandingSector(game, sector2) {
  if (!game.gameMap.isEdgeSector(sector2)) {
    return false;
  }
  if (sector2.isBase) {
    return false;
  }
  for (const rebel of game.rebelPlayers) {
    if (rebel.primarySquad.sectorId === sector2.sectorId) {
      return false;
    }
  }
  return true;
}
function getValidLandingSectors(game) {
  return game.gameMap.getEdgeSectors().filter(
    (sector2) => isValidLandingSector(game, sector2)
  );
}
function placeLanding(game, player, sector2) {
  if (!isValidLandingSector(game, sector2)) {
    throw new Error(`Invalid landing sector: ${sector2.sectorName}`);
  }
  player.primarySquad.sectorId = sector2.sectorId;
  game.message(`${player.name} landed at ${sector2.sectorName}`);
}
function equipStartingEquipment(game, merc, equipmentType) {
  const equipment = game.drawEquipment(equipmentType);
  if (equipment) {
    merc.equip(equipment);
    game.message(`${merc.mercName} equipped ${equipment.equipmentName}`);
  }
  return equipment;
}
function getUnoccupiedIndustries(game) {
  const occupiedSectorIds = /* @__PURE__ */ new Set();
  for (const rebel of game.rebelPlayers) {
    if (rebel.primarySquad.sectorId) {
      occupiedSectorIds.add(rebel.primarySquad.sectorId);
    }
  }
  return game.gameMap.getAllSectors().filter(
    (sector2) => sector2.isIndustry && !occupiedSectorIds.has(sector2.sectorId)
  );
}
function placeInitialMilitia(game) {
  const difficulty = game.setupConfig.dictatorStrength.difficulty;
  const unoccupiedIndustries = getUnoccupiedIndustries(game);
  let totalPlaced = 0;
  for (const sector2 of unoccupiedIndustries) {
    const placed = sector2.addDictatorMilitia(difficulty);
    totalPlaced += placed;
    game.message(`Placed ${placed} militia at ${sector2.sectorName}`);
  }
  game.message(`Initial militia: ${totalPlaced} total on ${unoccupiedIndustries.length} industries`);
  return totalPlaced;
}
function hireDictatorMerc(game) {
  const merc = game.drawMerc();
  if (merc) {
    game.dictatorPlayer.hiredMercs.push(merc);
    const targetSector = selectNewMercLocation(game);
    if (targetSector) {
      merc.sectorId = targetSector.sectorId;
      game.dictatorPlayer.stationedSectorId = targetSector.sectorId;
      game.message(`Dictator hired ${merc.mercName} (stationed at ${targetSector.sectorName})`);
    } else {
      game.message(`Dictator hired ${merc.mercName}`);
    }
  }
  return merc;
}
function applyDictatorSetupAbility(game) {
  applyDictatorSetupAbilities(game);
}
function drawTacticsHand(game) {
  if (game.dictatorPlayer.isAI) {
    game.message("AI Dictator plays tactics from deck (no hand)");
    return [];
  }
  const drawnCards = [];
  const targetHandSize = DictatorConstants.HAND_SIZE;
  const tacticsHand = game.dictatorPlayer.tacticsHand;
  const tacticsDeck = game.dictatorPlayer.tacticsDeck;
  while (tacticsHand.count(TacticsCard) < targetHandSize) {
    const card = tacticsDeck.first(TacticsCard);
    if (!card) break;
    card.putInto(tacticsHand);
    drawnCards.push(card);
  }
  game.message(`Dictator drew ${drawnCards.length} tactics cards`);
  return drawnCards;
}
function placeExtraMilitia(game, placements) {
  const extraBudget = game.setupConfig.dictatorStrength.extra;
  let totalPlaced = 0;
  for (const [sectorId, count] of placements) {
    if (totalPlaced + count > extraBudget) {
      const remaining = extraBudget - totalPlaced;
      if (remaining <= 0) break;
      const sector3 = game.getSector(sectorId);
      if (sector3) {
        const placed = sector3.addDictatorMilitia(remaining);
        totalPlaced += placed;
        game.message(`Placed ${placed} extra militia at ${sector3.sectorName}`);
      }
      break;
    }
    const sector2 = game.getSector(sectorId);
    if (sector2) {
      const placed = sector2.addDictatorMilitia(count);
      totalPlaced += placed;
      game.message(`Placed ${placed} extra militia at ${sector2.sectorName}`);
    }
  }
  return totalPlaced;
}
function autoPlaceExtraMilitia(game) {
  const { distributeExtraMilitiaEvenly: distributeExtraMilitiaEvenly2 } = (init_ai_helpers(), __toCommonJS(ai_helpers_exports));
  const extraBudget = game.setupConfig.dictatorStrength.extra;
  if (extraBudget === 0) {
    return 0;
  }
  const placements = distributeExtraMilitiaEvenly2(game, extraBudget);
  let totalPlaced = 0;
  for (const count of placements.values()) {
    totalPlaced += count;
  }
  if (totalPlaced > 0) {
    game.message(`Total: ${totalPlaced} extra militia distributed evenly`);
  }
  return totalPlaced;
}
function executeDictatorDay1(game) {
  game.message("=== Dictator Day 1 Phase ===");
  placeInitialMilitia(game);
  hireDictatorMerc(game);
  applyDictatorSetupAbility(game);
  drawTacticsHand(game);
  autoPlaceExtraMilitia(game);
  game.message("=== Dictator Day 1 Complete ===");
}
function getDay1Summary(game) {
  const lines = [];
  lines.push("=== Day 1 Complete ===");
  lines.push("");
  lines.push("Rebels:");
  for (const rebel of game.rebelPlayers) {
    const sector2 = game.getSector(rebel.primarySquad.sectorId);
    const mercs = rebel.team.map((m) => m.mercName).join(", ");
    lines.push(`  ${rebel.name}: ${mercs}`);
    lines.push(`    Landing: ${sector2?.sectorName ?? "Unknown"}`);
  }
  lines.push("");
  lines.push("Dictator:");
  lines.push(`  Name: ${game.dictatorPlayer.dictator?.dictatorName}`);
  lines.push(`  Tactics in hand: ${game.dictatorPlayer.tacticsHand?.count(TacticsCard)}`);
  lines.push(`  Tactics in deck: ${game.dictatorPlayer.tacticsDeck?.count(TacticsCard)}`);
  const sectorsWithMilitia = game.gameMap.getAllSectors().filter((s) => s.dictatorMilitia > 0);
  const totalMilitia = sectorsWithMilitia.reduce((sum, s) => sum + s.dictatorMilitia, 0);
  lines.push(`  Total militia: ${totalMilitia} across ${sectorsWithMilitia.length} sectors`);
  lines.push("");
  lines.push("Proceed to Day 2");
  return lines.join("\n");
}
function isRebelDay1Complete(game, player) {
  if (player.teamSize < TeamConstants.STARTING_MERCS) {
    return false;
  }
  if (!player.primarySquad.sectorId) {
    return false;
  }
  return true;
}
function isRebelPhaseComplete(game) {
  return game.rebelPlayers.every((rebel) => isRebelDay1Complete(game, rebel));
}
function getStartingMercCount() {
  return TeamConstants.STARTING_MERCS;
}
function getMercsToDrawForHiring() {
  return 3;
}
function getMaxMilitiaPerSector() {
  return SectorConstants.MAX_MILITIA_PER_SIDE;
}

// src/rules/combat.ts
init_elements();
init_constants();
init_ai_helpers();
function rollDie() {
  return Math.floor(Math.random() * CombatConstants.DICE_SIDES) + 1;
}
function rollDice(count) {
  return Array.from({ length: count }, () => rollDie());
}
function isBadger(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === "badger";
  }
  return false;
}
function isKastern(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === "kastern";
  }
  return false;
}
function isLucid(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === "lucid";
  }
  return false;
}
function isBasic(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === "basic";
  }
  return false;
}
function countHitsForCombatant(rolls, combatant) {
  const threshold = isLucid(combatant) ? 3 : CombatConstants.HIT_THRESHOLD;
  return rolls.filter((r) => r >= threshold).length;
}
function shouldBasicReroll(combatant, rolls, hits) {
  if (!isBasic(combatant) || combatant.hasUsedReroll) {
    return false;
  }
  const expectedHits = rolls.length * 0.5;
  return hits < expectedHits - 0.5;
}
function isMax(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === "max";
  }
  return false;
}
function applyMaxDebuff(enemies, allies) {
  const maxInSquad = allies.some((c) => isMax(c) && c.health > 0);
  if (!maxInSquad) return;
  for (const enemy of enemies) {
    if (!enemy.isMilitia && !enemy.isDictator && !enemy.isAttackDog) {
      enemy.combat = Math.max(0, enemy.combat - 1);
    }
  }
}
function isSurgeon(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === "surgeon";
  }
  return false;
}
function applySurgeonHeal(game, surgeon, allies) {
  if (!isSurgeon(surgeon) || surgeon.combat <= 1) {
    return false;
  }
  const damagedAllies = allies.filter(
    (c) => c !== surgeon && c.health > 0 && c.health < c.maxHealth && !c.isMilitia && !c.isAttackDog
  );
  if (damagedAllies.length === 0) {
    return false;
  }
  const mostDamaged = damagedAllies.sort(
    (a, b) => b.maxHealth - b.health - (a.maxHealth - a.health)
  )[0];
  surgeon.combat--;
  mostDamaged.health = Math.min(mostDamaged.health + 1, mostDamaged.maxHealth);
  if (mostDamaged.sourceElement instanceof MercCard) {
    mostDamaged.sourceElement.heal(1);
  }
  game.message(`${surgeon.name} sacrifices a die to heal ${mostDamaged.name} for 1`);
  return true;
}
function isAdelheid(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === "adelheid";
  }
  return false;
}
function isGolem(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === "golem";
  }
  return false;
}
function isBouba(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === "bouba";
  }
  return false;
}
function hasHandgun(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    const weapon = combatant.sourceElement.weaponSlot;
    return weapon?.equipmentName.toLowerCase().includes("handgun") ?? false;
  }
  return false;
}
function applyBoubaBonus(combatants) {
  for (const combatant of combatants) {
    if (isBouba(combatant) && hasHandgun(combatant) && combatant.health > 0) {
      combatant.combat += 1;
    }
  }
}
function isBuzzkill(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === "buzzkill";
  }
  return false;
}
function isKhenn(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === "khenn";
  }
  return false;
}
function isMayhem(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === "mayhem";
  }
  return false;
}
function hasUzi(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    const weapon = combatant.sourceElement.weaponSlot;
    return weapon?.equipmentName.toLowerCase().includes("uzi") ?? false;
  }
  return false;
}
function isMeatbop(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === "meatbop";
  }
  return false;
}
function hasAccessory(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.accessorySlot !== void 0;
  }
  return false;
}
function isRa(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === "ra";
  }
  return false;
}
function isRozeske(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === "rozeske";
  }
  return false;
}
function hasArmor(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.armorSlot !== void 0;
  }
  return false;
}
function isRunde(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === "runde";
  }
  return false;
}
function isSarge(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === "sarge";
  }
  return false;
}
function isStumpy(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === "stumpy";
  }
  return false;
}
function hasExplosive(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    const weapon = combatant.sourceElement.weaponSlot;
    if (!weapon) return false;
    const name = weapon.equipmentName.toLowerCase();
    return name.includes("grenade") || name.includes("mortar");
  }
  return false;
}
function isTack(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === "tack";
  }
  return false;
}
function isTavisto(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === "tavisto";
  }
  return false;
}
function isValkyrie(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === "valkyrie";
  }
  return false;
}
function isVandradi(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === "vandradi";
  }
  return false;
}
function hasMultiTargetWeapon(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    const weapon = combatant.sourceElement.weaponSlot;
    return weapon?.targets !== void 0 && weapon.targets > 0;
  }
  return false;
}
function isVulture(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === "vulture";
  }
  return false;
}
function isWalter(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === "walter";
  }
  return false;
}
function isWolverine(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === "wolverine";
  }
  return false;
}
function isDutch(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === "dutch";
  }
  return false;
}
function isDutchUsingFists(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    const weapon = combatant.sourceElement.weaponSlot;
    if (!weapon) return true;
    const name = weapon.equipmentName.toLowerCase();
    return name.includes("sword");
  }
  return false;
}
function isMoe(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === "moe";
  }
  return false;
}
function hasSmaw(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    const weapon = combatant.sourceElement.weaponSlot;
    return weapon?.equipmentName.toLowerCase().includes("smaw") ?? false;
  }
  return false;
}
function applyMayhemBonus(combatants) {
  for (const combatant of combatants) {
    if (isMayhem(combatant) && hasUzi(combatant) && combatant.health > 0) {
      combatant.combat += 2;
    }
  }
}
function applyRozeskeBonus(combatants) {
  for (const combatant of combatants) {
    if (isRozeske(combatant) && hasArmor(combatant) && combatant.health > 0) {
      combatant.combat += 1;
    }
  }
}
function applyRaBonus(combatants) {
  for (const combatant of combatants) {
    if (isRa(combatant) && combatant.health > 0) {
      if (combatant.sourceElement instanceof MercCard && combatant.sourceElement.weaponSlot) {
        combatant.targets += 1;
      }
    }
  }
}
function applyKhennInitiative(combatants, game) {
  for (const combatant of combatants) {
    if (isKhenn(combatant) && combatant.health > 0) {
      const roll = Math.floor(Math.random() * 6) + 1;
      combatant.initiative = roll;
      game.message(`Khenn rolls ${roll} for initiative`);
    }
  }
}
function applyStumpyBonus(combatants) {
  for (const combatant of combatants) {
    if (isStumpy(combatant) && hasExplosive(combatant) && combatant.health > 0) {
      combatant.combat += 1;
    }
  }
}
function applyVandradiBonus(combatants) {
  for (const combatant of combatants) {
    if (isVandradi(combatant) && hasMultiTargetWeapon(combatant) && combatant.health > 0) {
      combatant.combat += 1;
    }
  }
}
function applySargeBonus(game, combatants) {
  const sargeCombatants = combatants.filter((c) => isSarge(c) && c.health > 0);
  if (sargeCombatants.length === 0) return;
  for (const sarge of sargeCombatants) {
    const sargeMerc = sarge.sourceElement;
    for (const rebel of game.rebelPlayers) {
      const primaryMercs = rebel.primarySquad.getMercs().filter((m) => !m.isDead);
      const secondaryMercs = rebel.secondarySquad.getMercs().filter((m) => !m.isDead);
      let squadMates = null;
      if (primaryMercs.includes(sargeMerc)) {
        squadMates = primaryMercs;
      } else if (secondaryMercs.includes(sargeMerc)) {
        squadMates = secondaryMercs;
      }
      if (squadMates) {
        const maxInitiative = Math.max(...squadMates.map((m) => m.initiative));
        if (sargeMerc.initiative >= maxInitiative) {
          sarge.initiative += 1;
          sarge.combat += 1;
        }
        break;
      }
    }
  }
}
function applyTackBonus(game, combatants) {
  const tackCombatants = combatants.filter((c) => isTack(c) && c.health > 0);
  if (tackCombatants.length === 0) return;
  for (const tack of tackCombatants) {
    const tackMerc = tack.sourceElement;
    for (const rebel of game.rebelPlayers) {
      const primaryMercs = rebel.primarySquad.getMercs().filter((m) => !m.isDead);
      const secondaryMercs = rebel.secondarySquad.getMercs().filter((m) => !m.isDead);
      let squadMates = null;
      if (primaryMercs.includes(tackMerc)) {
        squadMates = primaryMercs;
      } else if (secondaryMercs.includes(tackMerc)) {
        squadMates = secondaryMercs;
      }
      if (squadMates) {
        const maxInitiative = Math.max(...squadMates.map((m) => m.initiative));
        if (tackMerc.initiative >= maxInitiative) {
          for (const combatant of combatants) {
            if (combatant.sourceElement instanceof MercCard && squadMates.includes(combatant.sourceElement) && combatant.health > 0) {
              combatant.initiative += 2;
            }
          }
        }
        break;
      }
    }
  }
}
function applyValkyrieBonus(game, combatants) {
  const valkyrieCombatants = combatants.filter((c) => isValkyrie(c) && c.health > 0);
  if (valkyrieCombatants.length === 0) return;
  for (const valkyrie of valkyrieCombatants) {
    const valkyrieMerc = valkyrie.sourceElement;
    for (const rebel of game.rebelPlayers) {
      const primaryMercs = rebel.primarySquad.getMercs().filter((m) => !m.isDead);
      const secondaryMercs = rebel.secondarySquad.getMercs().filter((m) => !m.isDead);
      let squadMates = null;
      if (primaryMercs.includes(valkyrieMerc)) {
        squadMates = primaryMercs;
      } else if (secondaryMercs.includes(valkyrieMerc)) {
        squadMates = secondaryMercs;
      }
      if (squadMates) {
        for (const combatant of combatants) {
          if (combatant.sourceElement instanceof MercCard && squadMates.includes(combatant.sourceElement) && combatant.sourceElement !== valkyrieMerc && combatant.health > 0) {
            combatant.initiative += 1;
          }
        }
        break;
      }
    }
  }
}
function applyTavistoBonus(game, combatants) {
  const tavistoCombatants = combatants.filter((c) => isTavisto(c) && c.health > 0);
  if (tavistoCombatants.length === 0) return;
  for (const tavisto of tavistoCombatants) {
    const tavistoMerc = tavisto.sourceElement;
    for (const rebel of game.rebelPlayers) {
      const primaryMercs = rebel.primarySquad.getMercs().filter((m) => !m.isDead);
      const secondaryMercs = rebel.secondarySquad.getMercs().filter((m) => !m.isDead);
      let squadMates = null;
      if (primaryMercs.includes(tavistoMerc)) {
        squadMates = primaryMercs;
      } else if (secondaryMercs.includes(tavistoMerc)) {
        squadMates = secondaryMercs;
      }
      if (squadMates) {
        const hasWoman = squadMates.some((m) => {
          const femaleMercs = ["ewok", "faustina", "natasha", "sonia", "tack", "teresa", "valkyrie", "adelheid"];
          return femaleMercs.includes(m.mercId) && m !== tavistoMerc;
        });
        if (hasWoman) {
          tavisto.initiative += 1;
          tavisto.combat += 1;
        }
        break;
      }
    }
  }
}
function applyVultureBonus(combatants) {
  for (const combatant of combatants) {
    if (isVulture(combatant) && combatant.health > 0) {
      const merc = combatant.sourceElement;
      let penalty = 0;
      if (merc.weaponSlot?.initiative && merc.weaponSlot.initiative < 0) {
        penalty += merc.weaponSlot.initiative;
      }
      if (merc.armorSlot?.initiative && merc.armorSlot.initiative < 0) {
        penalty += merc.armorSlot.initiative;
      }
      if (merc.accessorySlot?.initiative && merc.accessorySlot.initiative < 0) {
        penalty += merc.accessorySlot.initiative;
      }
      combatant.initiative -= penalty;
    }
  }
}
function applyWalterBonus(game, combatants) {
  const walterCombatant = combatants.find((c) => isWalter(c) && c.health > 0);
  if (!walterCombatant) return;
  const walterMerc = walterCombatant.sourceElement;
  let walterOwnerId;
  for (const rebel of game.rebelPlayers) {
    if (rebel.team.includes(walterMerc)) {
      walterOwnerId = `${rebel.position}`;
      break;
    }
  }
  if (!walterOwnerId) return;
  for (const combatant of combatants) {
    if (combatant.isMilitia && combatant.ownerId === walterOwnerId) {
      combatant.initiative += 2;
    }
  }
}
function applyDutchBonus(combatants) {
  for (const combatant of combatants) {
    if (isDutch(combatant) && isDutchUsingFists(combatant) && combatant.health > 0) {
      combatant.combat += 1;
      combatant.initiative += 1;
    }
  }
}
function applyMoeBonus(combatants) {
  for (const combatant of combatants) {
    if (isMoe(combatant) && hasSmaw(combatant) && combatant.health > 0) {
      combatant.targets += 1;
    }
  }
}
function executeGolemPreCombat(game, rebels, dictatorSide) {
  const allCombatants = [...rebels, ...dictatorSide];
  const golems = allCombatants.filter((c) => isGolem(c) && c.health > 0);
  for (const golem of golems) {
    const enemies = golem.isDictatorSide ? rebels : dictatorSide;
    const aliveEnemies = enemies.filter((e) => e.health > 0 && !e.isAttackDog);
    if (aliveEnemies.length === 0) continue;
    const target = sortTargetsByAIPriority(aliveEnemies)[0];
    game.message(`${golem.name} strikes before combat begins!`);
    game.message(`${golem.name} targets: ${target.name}`);
    const rolls = rollDice(golem.combat);
    const hits = countHitsForCombatant(rolls, golem);
    game.message(`${golem.name} rolls [${rolls.join(", ")}] - ${hits} hit(s)`);
    if (hits > 0) {
      const damage = applyDamage(target, hits, game, golem.armorPiercing);
      if (target.health <= 0) {
        game.message(`${golem.name} kills ${target.name} before combat starts!`);
      } else {
        game.message(`${golem.name} hits ${target.name} for ${damage} damage`);
      }
    }
  }
}
function sortByInitiative(combatants) {
  return [...combatants].sort((a, b) => {
    const aIsKastern = isKastern(a);
    const bIsKastern = isKastern(b);
    if (aIsKastern && !bIsKastern) return -1;
    if (bIsKastern && !aIsKastern) return 1;
    const aIsBadger = isBadger(a);
    const bIsBadger = isBadger(b);
    if (aIsBadger && b.isMilitia) return -1;
    if (bIsBadger && a.isMilitia) return 1;
    if (b.initiative !== a.initiative) {
      return b.initiative - a.initiative;
    }
    if (a.isDictatorSide !== b.isDictatorSide) {
      return a.isDictatorSide ? -1 : 1;
    }
    return 0;
  });
}
var ATTACK_DOG_HEALTH = 3;
var ATTACK_DOG_ID = "attack-dog";
function hasAttackDogEquipped(merc) {
  return merc.accessorySlot?.equipmentId === ATTACK_DOG_ID;
}
function isImmuneToAttackDogs(merc) {
  const ability = merc.ability?.toLowerCase() ?? "";
  return ability.includes("immune to attack dogs");
}
function willNotHarmDogs(merc) {
  const ability = merc.ability?.toLowerCase() ?? "";
  return ability.includes("will not harm dogs");
}
function mercToCombatant(merc, isDictatorSide) {
  return {
    id: String(merc.id),
    name: merc.mercName,
    initiative: merc.initiative,
    combat: merc.combat,
    health: merc.health,
    maxHealth: merc.maxHealth,
    armor: merc.equipmentArmor,
    targets: merc.targets,
    isDictatorSide,
    isMilitia: false,
    isDictator: false,
    isAttackDog: false,
    sourceElement: merc,
    armorPiercing: merc.weaponSlot?.negatesArmor ?? false,
    // MERC-38e
    hasOneUseWeapon: merc.weaponSlot?.isOneUse ?? false,
    // MERC-f0y
    hasAttackDog: hasAttackDogEquipped(merc),
    // MERC-l09
    isImmuneToAttackDogs: isImmuneToAttackDogs(merc),
    // MERC-l09
    willNotHarmDogs: willNotHarmDogs(merc)
    // MERC-l09
  };
}
function dictatorToCombatant(dictator) {
  return {
    id: String(dictator.id),
    name: dictator.dictatorName,
    initiative: dictator.initiative,
    combat: dictator.combat,
    health: dictator.health,
    maxHealth: dictator.maxHealth,
    armor: 0,
    // Dictator armor from equipment if any
    targets: 1,
    isDictatorSide: true,
    isMilitia: false,
    isDictator: true,
    isAttackDog: false,
    sourceElement: dictator,
    armorPiercing: false,
    hasOneUseWeapon: false,
    hasAttackDog: false,
    isImmuneToAttackDogs: false,
    willNotHarmDogs: false
  };
}
function militiaToCombatants(count, isDictatorSide, ownerId) {
  const combatants = [];
  for (let i = 0; i < count; i++) {
    combatants.push({
      id: `militia-${isDictatorSide ? "dictator" : ownerId}-${i}`,
      name: isDictatorSide ? "Dictator Militia" : "Rebel Militia",
      initiative: CombatConstants.MILITIA_INITIATIVE,
      combat: CombatConstants.MILITIA_COMBAT,
      health: CombatConstants.MILITIA_HEALTH,
      maxHealth: CombatConstants.MILITIA_HEALTH,
      armor: CombatConstants.MILITIA_ARMOR,
      targets: CombatConstants.MILITIA_TARGETS,
      isDictatorSide,
      isMilitia: true,
      isDictator: false,
      isAttackDog: false,
      sourceElement: null,
      ownerId,
      armorPiercing: false,
      hasOneUseWeapon: false,
      hasAttackDog: false,
      isImmuneToAttackDogs: false,
      willNotHarmDogs: false
    });
  }
  return combatants;
}
function createAttackDogCombatant(ownerId, isDictatorSide, index) {
  return {
    id: `attack-dog-${ownerId}-${index}`,
    name: "Attack Dog",
    initiative: 0,
    // Dogs don't act on their own
    combat: 0,
    // Dogs don't attack
    health: ATTACK_DOG_HEALTH,
    maxHealth: ATTACK_DOG_HEALTH,
    armor: 0,
    targets: 0,
    isDictatorSide,
    isMilitia: false,
    isDictator: false,
    isAttackDog: true,
    sourceElement: null,
    ownerId,
    armorPiercing: false,
    hasOneUseWeapon: false,
    hasAttackDog: false,
    isImmuneToAttackDogs: false,
    willNotHarmDogs: false
  };
}
function refreshCombatantStats(combatant) {
  if (combatant.isMilitia) {
    return;
  }
  if (combatant.sourceElement instanceof MercCard) {
    const merc = combatant.sourceElement;
    combatant.initiative = merc.initiative;
    combatant.combat = merc.combat;
    combatant.targets = merc.targets;
    combatant.armor = merc.equipmentArmor;
    combatant.armorPiercing = merc.weaponSlot?.negatesArmor ?? false;
    combatant.hasOneUseWeapon = merc.weaponSlot?.isOneUse ?? false;
  } else if (combatant.sourceElement instanceof DictatorCard) {
    const dictator = combatant.sourceElement;
    combatant.initiative = dictator.initiative;
    combatant.combat = dictator.combat;
  }
}
function isHaarg(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === "haarg";
  }
  return false;
}
function applyHaargBonus(allCombatants) {
  const haargCombatants = allCombatants.filter((c) => isHaarg(c) && c.health > 0);
  if (haargCombatants.length === 0) return;
  const otherCombatants = allCombatants.filter((c) => !isHaarg(c) && c.health > 0);
  if (otherCombatants.length === 0) return;
  const maxInitiative = Math.max(...otherCombatants.map((c) => c.initiative));
  const maxCombat = Math.max(...otherCombatants.map((c) => c.combat));
  for (const haarg of haargCombatants) {
    const baseInitiative = haarg.sourceElement instanceof MercCard ? haarg.sourceElement.initiative : haarg.initiative;
    const baseCombat = haarg.sourceElement instanceof MercCard ? haarg.sourceElement.combat : haarg.combat;
    if (maxInitiative > baseInitiative) {
      haarg.initiative = baseInitiative + 1;
    }
    if (maxCombat > baseCombat) {
      haarg.combat = baseCombat + 1;
    }
  }
}
function isSnake(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === "snake";
  }
  return false;
}
function isVandal(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === "vandal";
  }
  return false;
}
function applySnakeBonus(game, allCombatants) {
  const snakeCombatants = allCombatants.filter((c) => isSnake(c) && c.health > 0);
  if (snakeCombatants.length === 0) return;
  for (const snake of snakeCombatants) {
    const snakeMerc = snake.sourceElement;
    for (const rebel of game.rebelPlayers) {
      const primaryMercs = rebel.primarySquad.getMercs();
      if (primaryMercs.includes(snakeMerc)) {
        if (primaryMercs.filter((m) => !m.isDead).length === 1) {
          snake.initiative += 1;
          snake.combat += 1;
        }
        break;
      }
      const secondaryMercs = rebel.secondarySquad.getMercs();
      if (secondaryMercs.includes(snakeMerc)) {
        if (secondaryMercs.filter((m) => !m.isDead).length === 1) {
          snake.initiative += 1;
          snake.combat += 1;
        }
        break;
      }
    }
  }
}
function getValidRetreatSectors(game, currentSector, player) {
  const adjacentSectors = game.getAdjacentSectors(currentSector);
  return adjacentSectors.filter((sector2) => {
    const hasDictatorForces = sector2.dictatorMilitia > 0 || game.getDictatorMercsInSector(sector2).length > 0 || game.dictatorPlayer.baseRevealed && game.dictatorPlayer.baseSectorId === sector2.sectorId;
    if (!hasDictatorForces) {
      return true;
    }
    const dictatorUnits = game.getDictatorUnitsInSector(sector2);
    const playerUnits = game.getRebelUnitsInSector(sector2, player);
    if (playerUnits > dictatorUnits) {
      return true;
    }
    const totalRebelUnits = game.getTotalRebelUnitsInSector(sector2);
    return totalRebelUnits > dictatorUnits;
  });
}
function canRetreat(game, sector2, player) {
  return getValidRetreatSectors(game, sector2, player).length > 0;
}
function executeRetreat(game, fromSector, toSector, player) {
  if (player.primarySquad.sectorId === fromSector.sectorId) {
    player.primarySquad.sectorId = toSector.sectorId;
    game.message(`${player.name}'s primary squad retreats to ${toSector.sectorName}`);
  }
  if (player.secondarySquad.sectorId === fromSector.sectorId) {
    player.secondarySquad.sectorId = toSector.sectorId;
    game.message(`${player.name}'s secondary squad retreats to ${toSector.sectorName}`);
  }
}
function getCombatants(game, sector2, attackingPlayer) {
  const rebels = [];
  const dictator = [];
  for (const rebel of game.rebelPlayers) {
    const rebelMercs = game.getMercsInSector(sector2, rebel);
    for (const merc of rebelMercs) {
      if (!merc.isDead) {
        rebels.push(mercToCombatant(merc, false));
      }
    }
    const rebelMilitia = sector2.getRebelMilitia(`${rebel.position}`);
    rebels.push(...militiaToCombatants(rebelMilitia, false, `${rebel.position}`));
  }
  dictator.push(...militiaToCombatants(sector2.dictatorMilitia, true));
  const dictatorMercs = game.getDictatorMercsInSector(sector2);
  for (const merc of dictatorMercs) {
    dictator.push(mercToCombatant(merc, true));
  }
  if (game.dictatorPlayer.baseRevealed && game.dictatorPlayer.baseSectorId === sector2.sectorId) {
    const dictatorCard = game.dictatorPlayer.dictator;
    if (dictatorCard && !dictatorCard.isDead) {
      dictator.push(dictatorToCombatant(dictatorCard));
    }
  }
  return { rebels, dictator };
}
function canTargetDictator(dictatorSide) {
  const nonDictatorUnits = dictatorSide.filter((c) => !c.isDictator && c.health > 0);
  return nonDictatorUnits.length === 0;
}
function isRizen(combatant) {
  if (combatant.sourceElement instanceof MercCard) {
    return combatant.sourceElement.mercId === "rizen";
  }
  return false;
}
function selectTargets(attacker, enemies, maxTargets) {
  const aliveEnemies = enemies.filter((e) => e.health > 0);
  if (isRizen(attacker)) {
    const militia = aliveEnemies.filter((e) => e.isMilitia);
    const nonMilitia = aliveEnemies.filter((e) => !e.isMilitia);
    const rizenTargets = [...militia, ...nonMilitia.slice(0, maxTargets)];
    return rizenTargets;
  }
  if (isBuzzkill(attacker)) {
    const mercs = aliveEnemies.filter((e) => !e.isMilitia && !e.isAttackDog);
    const militia = aliveEnemies.filter((e) => e.isMilitia || e.isAttackDog);
    const buzzkillTargets = [...mercs, ...militia].slice(0, maxTargets);
    return buzzkillTargets;
  }
  const sortedForRunde = [...aliveEnemies].sort((a, b) => {
    const aIsRunde = isRunde(a);
    const bIsRunde = isRunde(b);
    if (aIsRunde && !bIsRunde) return 1;
    if (bIsRunde && !aIsRunde) return -1;
    return 0;
  });
  if (!attacker.isDictatorSide) {
    const canHitDictator = canTargetDictator(sortedForRunde);
    const validTargets = canHitDictator ? sortedForRunde : sortedForRunde.filter((e) => !e.isDictator);
    return validTargets.slice(0, maxTargets);
  }
  const prioritized = sortTargetsByAIPriority(sortedForRunde);
  return prioritized.slice(0, maxTargets);
}
function applyDamage(target, damage, game, armorPiercing = false) {
  let remainingDamage = damage;
  if (!armorPiercing && target.armor > 0 && remainingDamage > 0) {
    const armorAbsorbed = Math.min(target.armor, remainingDamage);
    target.armor -= armorAbsorbed;
    remainingDamage -= armorAbsorbed;
    if (target.armor <= 0 && target.sourceElement instanceof MercCard) {
      const merc = target.sourceElement;
      if (merc.armorSlot) {
        merc.armorSlot.isDamaged = true;
        game.message(`${merc.mercName}'s ${merc.armorSlot.equipmentName} is destroyed!`);
        const armor = merc.unequip("Armor");
        if (armor) {
          const discard = game.getEquipmentDiscard("Armor");
          if (discard) armor.putInto(discard);
        }
      }
    }
  } else if (armorPiercing && target.armor > 0) {
    game.message(`Armor piercing attack ignores ${target.name}'s armor!`);
  }
  const healthDamage = Math.min(remainingDamage, target.health);
  target.health -= healthDamage;
  return healthDamage;
}
function assignAttackDog(attacker, enemies, dogState, game, dogIndex) {
  if (!attacker.hasAttackDog) return null;
  const validTargets = enemies.filter(
    (e) => e.health > 0 && !e.isMilitia && !e.isAttackDog && !e.isImmuneToAttackDogs && !dogState.assignments.has(e.id)
  );
  if (validTargets.length === 0) return null;
  const sortedTargets = sortTargetsByAIPriority(validTargets);
  const target = sortedTargets[0];
  const dog = createAttackDogCombatant(attacker.id, attacker.isDictatorSide, dogIndex);
  dogState.assignments.set(target.id, dog);
  dogState.dogs.push(dog);
  game.message(`${attacker.name} releases Attack Dog on ${target.name}!`);
  game.message(`${target.name} must attack the dog before doing anything else.`);
  attacker.hasAttackDog = false;
  return dog;
}
function selectTargetsWithDogs(attacker, enemies, maxTargets, dogState) {
  const assignedDog = dogState.assignments.get(attacker.id);
  if (assignedDog && assignedDog.health > 0) {
    if (attacker.willNotHarmDogs) {
      return [];
    }
    return [assignedDog];
  }
  return selectTargets(attacker, enemies, maxTargets);
}
function executeCombatRound(roundNumber, rebels, dictatorSide, game, dogState) {
  const activeDogState = dogState || {
    assignments: /* @__PURE__ */ new Map(),
    dogs: []
  };
  for (const combatant of [...rebels, ...dictatorSide]) {
    if (combatant.health > 0) {
      refreshCombatantStats(combatant);
    }
  }
  applyHaargBonus([...rebels, ...dictatorSide]);
  applySnakeBonus(game, [...rebels, ...dictatorSide]);
  applyMaxDebuff(rebels, dictatorSide);
  applyMaxDebuff(dictatorSide, rebels);
  applyBoubaBonus([...rebels, ...dictatorSide]);
  applyMayhemBonus([...rebels, ...dictatorSide]);
  applyRozeskeBonus([...rebels, ...dictatorSide]);
  applyRaBonus([...rebels, ...dictatorSide]);
  applyStumpyBonus([...rebels, ...dictatorSide]);
  applyVandradiBonus([...rebels, ...dictatorSide]);
  applySargeBonus(game, [...rebels, ...dictatorSide]);
  applyTackBonus(game, [...rebels, ...dictatorSide]);
  applyValkyrieBonus(game, [...rebels, ...dictatorSide]);
  applyTavistoBonus(game, [...rebels, ...dictatorSide]);
  applyVultureBonus([...rebels, ...dictatorSide]);
  applyWalterBonus(game, [...rebels, ...dictatorSide]);
  applyDutchBonus([...rebels, ...dictatorSide]);
  applyMoeBonus([...rebels, ...dictatorSide]);
  applyKhennInitiative([...rebels, ...dictatorSide], game);
  executeGolemPreCombat(game, rebels, dictatorSide);
  const allCombatants = sortByInitiative([...rebels, ...dictatorSide]);
  const results = [];
  const casualties = [];
  let dogIndex = 0;
  for (const attacker of allCombatants) {
    if (attacker.health <= 0 || attacker.isAttackDog) continue;
    if (isMeatbop(attacker) && !hasAccessory(attacker)) {
      game.message(`${attacker.name} refuses to fight without an accessory!`);
      results.push({
        attacker,
        rolls: [],
        hits: 0,
        targets: [],
        damageDealt: /* @__PURE__ */ new Map()
      });
      continue;
    }
    const enemies = attacker.isDictatorSide ? rebels : dictatorSide;
    const aliveEnemies = enemies.filter((e) => e.health > 0 && !e.isAttackDog);
    if (aliveEnemies.length === 0) continue;
    if (attacker.hasAttackDog) {
      assignAttackDog(attacker, enemies, activeDogState, game, dogIndex++);
    }
    const targets = selectTargetsWithDogs(attacker, enemies, attacker.targets, activeDogState);
    if (targets.length === 0) {
      if (attacker.willNotHarmDogs) {
        game.message(`${attacker.name} refuses to harm the Attack Dog and cannot act.`);
      }
      results.push({
        attacker,
        rolls: [],
        hits: 0,
        targets: [],
        damageDealt: /* @__PURE__ */ new Map()
      });
      continue;
    }
    const targetNames = targets.map((t) => t.name).join(", ");
    game.message(`${attacker.name} declares targets: ${targetNames}`);
    const attackerAllies = attacker.isDictatorSide ? dictatorSide : rebels;
    applySurgeonHeal(game, attacker, attackerAllies);
    let rolls = rollDice(attacker.combat);
    let hits = countHitsForCombatant(rolls, attacker);
    game.message(`${attacker.name} rolls [${rolls.join(", ")}] - ${hits} hit(s)`);
    if (shouldBasicReroll(attacker, rolls, hits)) {
      game.message(`${attacker.name} uses reroll ability!`);
      attacker.hasUsedReroll = true;
      rolls = rollDice(attacker.combat);
      hits = countHitsForCombatant(rolls, attacker);
      game.message(`${attacker.name} rerolls [${rolls.join(", ")}] - ${hits} hit(s)`);
    }
    let wolverineBonus6s = 0;
    if (isWolverine(attacker)) {
      wolverineBonus6s = rolls.filter((r) => r === 6).length;
      if (wolverineBonus6s > 0) {
        game.message(`Wolverine's ${wolverineBonus6s} six(es) can hit additional targets!`);
      }
    }
    if (hits === 0) {
      results.push({
        attacker,
        rolls,
        hits: 0,
        targets: [],
        damageDealt: /* @__PURE__ */ new Map()
      });
      continue;
    }
    const damageDealt = /* @__PURE__ */ new Map();
    let expandedTargets = [...targets];
    if (wolverineBonus6s > 0) {
      const availableExtra = enemies.filter(
        (e) => e.health > 0 && !targets.includes(e) && !e.isAttackDog
      );
      const extraTargets = availableExtra.slice(0, wolverineBonus6s);
      if (extraTargets.length > 0) {
        expandedTargets.push(...extraTargets);
        game.message(`Wolverine adds targets: ${extraTargets.map((t) => t.name).join(", ")}`);
      }
    }
    let remainingHits = hits;
    for (const target of expandedTargets) {
      if (remainingHits <= 0) break;
      const damage = applyDamage(target, remainingHits, game, attacker.armorPiercing);
      damageDealt.set(target.id, damage);
      if (target.health <= 0) {
        if (isAdelheid(attacker) && target.isMilitia && !attacker.isDictatorSide) {
          const attackerMerc = attacker.sourceElement;
          const ownerPlayer = game.rebelPlayers.find(
            (p) => p.team.includes(attackerMerc)
          );
          if (ownerPlayer && sector) {
            sector.dictatorMilitia--;
            sector.addRebelMilitia(`${ownerPlayer.position}`, 1);
            game.message(`${attacker.name} converts ${target.name} to her side!`);
          } else {
            casualties.push(target);
            game.message(`${attacker.name} kills ${target.name}!`);
          }
        } else {
          casualties.push(target);
          game.message(`${attacker.name} kills ${target.name}!`);
          if (target.isAttackDog) {
            for (const [targetId, dog] of activeDogState.assignments.entries()) {
              if (dog.id === target.id) {
                activeDogState.assignments.delete(targetId);
                break;
              }
            }
          }
        }
      } else {
        game.message(`${attacker.name} hits ${target.name} for ${damage} damage`);
      }
      if (target.isMilitia || target.isAttackDog) {
        remainingHits--;
      } else {
        remainingHits -= damage;
      }
    }
    if (attacker.hasOneUseWeapon && attacker.sourceElement instanceof MercCard) {
      const merc = attacker.sourceElement;
      if (merc.weaponSlot?.isOneUse) {
        game.message(`${merc.mercName}'s ${merc.weaponSlot.equipmentName} is used up!`);
        const weapon = merc.unequip("Weapon");
        if (weapon) {
          const discard = game.getEquipmentDiscard("Weapon");
          if (discard) weapon.putInto(discard);
        }
        attacker.hasOneUseWeapon = false;
        attacker.armorPiercing = false;
      }
    }
    results.push({
      attacker,
      rolls,
      hits,
      targets,
      damageDealt
    });
  }
  const vandals = allCombatants.filter((c) => isVandal(c) && c.health > 0);
  for (const vandal of vandals) {
    const enemies = vandal.isDictatorSide ? rebels : dictatorSide;
    const aliveEnemies = enemies.filter((e) => e.health > 0 && !e.isAttackDog);
    if (aliveEnemies.length === 0) continue;
    game.message(`${vandal.name} fires second shot!`);
    const targets = selectTargetsWithDogs(vandal, enemies, vandal.targets, activeDogState);
    if (targets.length === 0) continue;
    const targetNames = targets.map((t) => t.name).join(", ");
    game.message(`${vandal.name} targets: ${targetNames}`);
    const rolls = rollDice(vandal.combat);
    const hits = countHitsForCombatant(rolls, vandal);
    game.message(`${vandal.name} rolls [${rolls.join(", ")}] - ${hits} hit(s)`);
    if (hits > 0) {
      const damageDealt = /* @__PURE__ */ new Map();
      let remainingHits = hits;
      for (const target of targets) {
        if (remainingHits <= 0) break;
        const damage = applyDamage(target, remainingHits, game, vandal.armorPiercing);
        damageDealt.set(target.id, damage);
        if (target.health <= 0) {
          casualties.push(target);
          game.message(`${vandal.name} kills ${target.name}!`);
        } else {
          game.message(`${vandal.name} hits ${target.name} for ${damage} damage`);
        }
        if (target.isMilitia || target.isAttackDog) {
          remainingHits--;
        } else {
          remainingHits -= damage;
        }
      }
      results.push({
        attacker: vandal,
        rolls,
        hits,
        targets,
        damageDealt
      });
    }
  }
  return { roundNumber, results, casualties };
}
function applyCombatResults(game, sector2, rebels, dictatorSide, attackingPlayer) {
  for (const combatant of [...rebels, ...dictatorSide]) {
    if (combatant.sourceElement instanceof MercCard) {
      const merc = combatant.sourceElement;
      const damageTaken = combatant.maxHealth - combatant.health;
      merc.damage = damageTaken;
      if (combatant.health <= 0) {
        let savedByEpinephrine = false;
        if (combatant.isDictatorSide && game.dictatorPlayer?.isAI) {
          const squadMercs = game.dictatorPlayer.hiredMercs.filter((m) => !m.isDead);
          const mercWithEpi = shouldUseEpinephrine(merc, squadMercs);
          if (mercWithEpi) {
            const epiShot = mercWithEpi.accessorySlot;
            if (epiShot) {
              mercWithEpi.unequip("Accessory");
              const discard = game.getEquipmentDiscard("Accessory");
              if (discard) epiShot.putInto(discard);
              combatant.health = 1;
              merc.damage = merc.maxHealth - 1;
              savedByEpinephrine = true;
              game.message(`${mercWithEpi.mercName} uses Epinephrine Shot to save ${merc.mercName}!`);
            }
          }
        } else if (!combatant.isDictatorSide) {
          for (const rebel of game.rebelPlayers) {
            if (rebel.team.includes(merc)) {
              const squadMercs = rebel.team.filter((m) => !m.isDead);
              const mercWithEpi = hasEpinephrineShot(squadMercs);
              if (mercWithEpi && mercWithEpi !== merc) {
                const epiShot = mercWithEpi.accessorySlot;
                if (epiShot) {
                  mercWithEpi.unequip("Accessory");
                  const discard = game.getEquipmentDiscard("Accessory");
                  if (discard) epiShot.putInto(discard);
                  combatant.health = 1;
                  merc.damage = merc.maxHealth - 1;
                  savedByEpinephrine = true;
                  game.message(`${mercWithEpi.mercName} uses Epinephrine Shot to save ${merc.mercName}!`);
                }
              }
              break;
            }
          }
        }
        if (!savedByEpinephrine) {
          merc.isDead = true;
          const equipmentTypes = ["Weapon", "Armor", "Accessory"];
          for (const eqType of equipmentTypes) {
            const equipment = merc.unequip(eqType);
            if (equipment) {
              const discard = game.getEquipmentDiscard(eqType);
              if (discard) equipment.putInto(discard);
            }
          }
          if (combatant.isDictatorSide) {
            const idx = game.dictatorPlayer.hiredMercs.indexOf(merc);
            if (idx >= 0) {
              game.dictatorPlayer.hiredMercs.splice(idx, 1);
            }
          } else {
            for (const rebel of game.rebelPlayers) {
              const idx = rebel.team.indexOf(merc);
              if (idx >= 0) {
                rebel.team.splice(idx, 1);
                break;
              }
            }
          }
          merc.putInto(game.mercDiscard);
          game.message(`${merc.mercName} has been killed in combat!`);
        }
      }
    } else if (combatant.sourceElement instanceof DictatorCard) {
      const dictator = combatant.sourceElement;
      const damageTaken = combatant.maxHealth - combatant.health;
      dictator.damage = damageTaken;
      if (combatant.health <= 0) {
        dictator.isDead = true;
        game.message(`THE DICTATOR HAS BEEN KILLED! REBELS WIN!`);
      }
    }
  }
  const survivingDictatorMilitia = dictatorSide.filter((c) => c.isMilitia && c.health > 0).length;
  sector2.dictatorMilitia = survivingDictatorMilitia;
  for (const rebel of game.rebelPlayers) {
    const playerId = `${rebel.position}`;
    const survivingMilitia = rebels.filter(
      (c) => c.isMilitia && c.health > 0 && c.ownerId === playerId
    ).length;
    sector2.rebelMilitia.set(playerId, survivingMilitia);
  }
}
function executeCombat(game, sector2, attackingPlayer, options = {}) {
  const { maxRounds = 10, interactive = true } = options;
  const isResuming = game.activeCombat !== null && game.activeCombat.sectorId === sector2.sectorId;
  let rebels;
  let dictator;
  let rounds;
  let allRebelCasualties;
  let allDictatorCasualties;
  let startRound;
  let dogState;
  if (isResuming && game.activeCombat) {
    rebels = game.activeCombat.rebelCombatants;
    dictator = game.activeCombat.dictatorCombatants;
    rounds = [];
    allRebelCasualties = game.activeCombat.rebelCasualties;
    allDictatorCasualties = game.activeCombat.dictatorCasualties;
    startRound = game.activeCombat.round + 1;
    dogState = {
      assignments: new Map(game.activeCombat.dogAssignments || []),
      dogs: game.activeCombat.dogs || []
    };
    game.message(`--- Combat continues at ${sector2.sectorName} ---`);
  } else {
    game.message(`=== Combat at ${sector2.sectorName} ===`);
    const combatants = getCombatants(game, sector2, attackingPlayer);
    rebels = combatants.rebels;
    dictator = combatants.dictator;
    rounds = [];
    allRebelCasualties = [];
    allDictatorCasualties = [];
    startRound = 1;
    dogState = {
      assignments: /* @__PURE__ */ new Map(),
      dogs: []
    };
    game.message(`Rebels: ${rebels.length} units`);
    game.message(`Dictator: ${dictator.length} units`);
    detonateLandMines(game, sector2, attackingPlayer);
  }
  let retreatSector;
  let didRetreat = false;
  let combatPending = false;
  let retreatAvailable = false;
  for (let round = startRound; round <= maxRounds; round++) {
    game.message(`--- Round ${round} ---`);
    const roundResult = executeCombatRound(round, rebels, dictator, game, dogState);
    rounds.push(roundResult);
    for (const casualty of roundResult.casualties) {
      if (casualty.isDictatorSide) {
        allDictatorCasualties.push(casualty);
      } else {
        allRebelCasualties.push(casualty);
      }
    }
    const aliveRebels2 = rebels.filter((c) => c.health > 0);
    const aliveDictator2 = dictator.filter((c) => c.health > 0);
    if (aliveRebels2.length === 0 || aliveDictator2.length === 0) {
      break;
    }
    retreatAvailable = canRetreat(game, sector2, attackingPlayer);
    if (interactive && retreatAvailable) {
      game.activeCombat = {
        sectorId: sector2.sectorId,
        attackingPlayerId: `${attackingPlayer.position}`,
        round,
        rebelCombatants: rebels,
        dictatorCombatants: dictator,
        rebelCasualties: allRebelCasualties,
        dictatorCasualties: allDictatorCasualties,
        // MERC-l09: Save dog state
        dogAssignments: Array.from(dogState.assignments.entries()),
        dogs: dogState.dogs
      };
      combatPending = true;
      game.message(`Round ${round} complete. You may retreat or continue fighting.`);
      break;
    }
  }
  if (combatPending) {
    return {
      rounds,
      rebelVictory: false,
      dictatorVictory: false,
      rebelCasualties: allRebelCasualties,
      dictatorCasualties: allDictatorCasualties,
      retreated: false,
      combatPending: true,
      canRetreat: retreatAvailable
    };
  }
  game.activeCombat = null;
  applyCombatResults(game, sector2, rebels, dictator, attackingPlayer);
  const aliveRebels = rebels.filter((c) => c.health > 0);
  const aliveDictator = dictator.filter((c) => c.health > 0);
  const outcome = {
    rounds,
    rebelVictory: aliveDictator.length === 0 && !didRetreat,
    dictatorVictory: aliveRebels.length === 0,
    rebelCasualties: allRebelCasualties,
    dictatorCasualties: allDictatorCasualties,
    retreated: didRetreat,
    retreatSector,
    combatPending: false,
    canRetreat: false
  };
  if (outcome.rebelVictory) {
    game.message(`Rebels are victorious at ${sector2.sectorName}!`);
  } else if (outcome.dictatorVictory) {
    game.message(`Dictator forces hold ${sector2.sectorName}!`);
  } else if (outcome.retreated) {
    game.message(`Rebels have retreated to ${retreatSector?.sectorName}!`);
  }
  game.message(`=== Combat Complete ===`);
  return outcome;
}
function executeCombatRetreat(game, retreatSector) {
  if (!game.activeCombat) {
    throw new Error("No active combat to retreat from");
  }
  const combatSector = game.getSector(game.activeCombat.sectorId);
  if (!combatSector) {
    throw new Error("Combat sector not found");
  }
  const attackingPlayer = game.rebelPlayers.find(
    (p) => `${p.position}` === game.activeCombat.attackingPlayerId
  );
  if (!attackingPlayer) {
    throw new Error("Attacking player not found");
  }
  executeRetreat(game, combatSector, retreatSector, attackingPlayer);
  const rebels = game.activeCombat.rebelCombatants;
  const dictator = game.activeCombat.dictatorCombatants;
  applyCombatResults(game, combatSector, rebels, dictator, attackingPlayer);
  const rebelCasualties = game.activeCombat.rebelCasualties;
  const dictatorCasualties = game.activeCombat.dictatorCasualties;
  game.activeCombat = null;
  game.message(`=== Combat Complete (Retreated) ===`);
  return {
    rounds: [],
    rebelVictory: false,
    dictatorVictory: false,
    rebelCasualties,
    dictatorCasualties,
    retreated: true,
    retreatSector,
    combatPending: false,
    canRetreat: false
  };
}
function hasEnemies(game, sector2, player) {
  if (sector2.dictatorMilitia > 0) return true;
  const dictatorMercs = game.getDictatorMercsInSector(sector2);
  if (dictatorMercs.length > 0) return true;
  if (game.dictatorPlayer.baseRevealed && game.dictatorPlayer.baseSectorId === sector2.sectorId && !game.dictatorPlayer.dictator?.isDead) {
    return true;
  }
  return false;
}
function calculateCombatOdds(game, sector2, player) {
  const { rebels, dictator } = getCombatants(game, sector2, player);
  const rebelStrength = rebels.reduce((sum, c) => sum + c.combat * c.health, 0);
  const dictatorStrength = dictator.reduce((sum, c) => sum + c.combat * c.health, 0);
  return {
    rebelStrength,
    dictatorStrength,
    advantage: rebelStrength - dictatorStrength
  };
}

// src/rules/tactics-effects.ts
init_ai_helpers();
function artilleryBarrage(game) {
  const dictatorSectors = game.gameMap.getAllSectors().filter((s) => s.dictatorMilitia > 0);
  const adjacentRebelSectors = /* @__PURE__ */ new Set();
  for (const sector2 of dictatorSectors) {
    for (const adjacent of game.getAdjacentSectors(sector2)) {
      const hasRebels = game.rebelPlayers.some(
        (r) => r.primarySquad.sectorId === adjacent.sectorId || r.secondarySquad.sectorId === adjacent.sectorId || adjacent.getTotalRebelMilitia() > 0
      );
      if (hasRebels) {
        adjacentRebelSectors.add(adjacent);
      }
    }
  }
  const sectorsToAttack = [...adjacentRebelSectors].slice(0, game.rebelCount);
  let totalDamage = 0;
  for (const sector2 of sectorsToAttack) {
    const roll = game.rollDie();
    game.message(`Artillery targets ${sector2.sectorName}: rolled ${roll} hits`);
    let remainingHits = roll;
    for (const rebel of game.rebelPlayers) {
      if (remainingHits <= 0) break;
      const militiaRemoved = sector2.removeRebelMilitia(`${rebel.position}`, remainingHits);
      remainingHits -= militiaRemoved;
      if (militiaRemoved > 0) {
        game.message(`${militiaRemoved} militia killed at ${sector2.sectorName}`);
      }
    }
    for (const rebel of game.rebelPlayers) {
      if (remainingHits <= 0) break;
      const mercs = game.getMercsInSector(sector2, rebel);
      for (const merc of mercs) {
        if (remainingHits <= 0) break;
        merc.takeDamage(1);
        remainingHits--;
        game.message(`${merc.mercName} takes 1 artillery damage`);
      }
    }
    totalDamage += roll;
  }
  return {
    success: true,
    message: `Artillery barrage dealt ${totalDamage} total damage across ${sectorsToAttack.length} sectors`,
    data: { sectorsHit: sectorsToAttack.length, totalDamage }
  };
}
function revealBase(game) {
  if (game.dictatorPlayer.baseRevealed) {
    return { success: true, message: "Base was already revealed" };
  }
  if (!game.dictatorPlayer.baseSectorId) {
    const baseSector = selectAIBaseLocation(game);
    if (baseSector) {
      game.dictatorPlayer.baseSectorId = baseSector.sectorId;
      game.message(`Dictator base established at ${baseSector.sectorName}`);
    }
  }
  game.dictatorPlayer.baseRevealed = true;
  game.dictatorPlayer.dictator?.enterPlay();
  if (game.dictatorPlayer.dictator && game.dictatorPlayer.baseSectorId) {
    game.dictatorPlayer.dictator.sectorId = game.dictatorPlayer.baseSectorId;
  }
  game.message("The Dictator reveals their base!");
  return { success: true, message: "Base revealed" };
}
function familyThreat(game) {
  let totalRemoved = 0;
  for (const sector2 of game.gameMap.getAllSectors()) {
    for (const rebel of game.rebelPlayers) {
      const removed = sector2.removeRebelMilitia(`${rebel.position}`, 2);
      if (removed > 0) {
        totalRemoved += removed;
        game.message(`${removed} militia fled from ${sector2.sectorName}`);
      }
    }
  }
  return {
    success: true,
    message: `Family threat: ${totalRemoved} militia fled`,
    data: { militiaRemoved: totalRemoved }
  };
}
function fodder(game) {
  const combatsTriggered = [];
  for (const rebel of game.rebelPlayers) {
    let maxMilitia = 0;
    let targetSector = null;
    for (const sector2 of game.gameMap.getAllSectors()) {
      const rebelMilitia = sector2.getRebelMilitia(`${rebel.position}`);
      if (rebelMilitia > maxMilitia) {
        maxMilitia = rebelMilitia;
        targetSector = sector2;
      }
    }
    if (targetSector && maxMilitia > 0) {
      const toSend = Math.ceil(maxMilitia / 2);
      const placed = targetSector.addDictatorMilitia(toSend);
      game.message(`Dictator sends ${placed} militia to attack ${rebel.name} at ${targetSector.sectorName}`);
      if (placed > 0) {
        combatsTriggered.push(targetSector.sectorName);
        executeCombat(game, targetSector, rebel);
      }
    }
  }
  return {
    success: true,
    message: `Fodder triggered combat at ${combatsTriggered.length} sectors`,
    data: { combats: combatsTriggered }
  };
}
function reinforcements(game) {
  const industries = game.gameMap.getAllSectors().filter(
    (s) => s.isIndustry && s.dictatorMilitia > 0
  );
  let totalPlaced = 0;
  for (const sector2 of industries) {
    const placed = sector2.addDictatorMilitia(game.rebelCount);
    totalPlaced += placed;
    if (placed > 0) {
      game.message(`Reinforced ${sector2.sectorName} with ${placed} militia`);
    }
  }
  return {
    success: true,
    message: `Reinforcements: ${totalPlaced} militia placed`,
    data: { totalPlaced, industriesReinforced: industries.length }
  };
}
function seizure(game) {
  game.message("Seizure effect triggered (incomplete card effect)");
  return revealBase(game);
}
function sentry(game) {
  const militiaToAdd = Math.ceil(game.rebelCount / 2);
  let totalPlaced = 0;
  for (const sector2 of game.gameMap.getAllSectors()) {
    const dictatorControls = sector2.dictatorMilitia > 0;
    const rebelControls = sector2.getTotalRebelMilitia() > 0 || game.rebelPlayers.some(
      (r) => r.primarySquad.sectorId === sector2.sectorId || r.secondarySquad.sectorId === sector2.sectorId
    );
    if (!dictatorControls && !rebelControls) {
      const placed = sector2.addDictatorMilitia(militiaToAdd);
      totalPlaced += placed;
      if (placed > 0) {
        game.message(`Sentry: ${placed} militia placed at ${sector2.sectorName}`);
      }
    }
  }
  return {
    success: true,
    message: `Sentry: ${totalPlaced} militia placed`,
    data: { totalPlaced }
  };
}
function blockTrade(game) {
  const cities = game.gameMap.getAllSectors().filter((s) => s.isCity && !s.explored);
  for (const city of cities) {
    city.explore();
    game.message(`${city.sectorName} is now explored (trade blocked)`);
  }
  return {
    success: true,
    message: `Block Trade: ${cities.length} cities explored`,
    data: { citiesExplored: cities.length }
  };
}
function conscripts(game) {
  game.conscriptsActive = true;
  game.conscriptsAmount = Math.ceil(game.rebelCount / 2);
  game.message(`Conscripts activated: ${game.conscriptsAmount} militia will be added each turn`);
  return {
    success: true,
    message: "Conscripts permanent effect activated",
    data: { amount: game.conscriptsAmount }
  };
}
function applyConscriptsEffect(game) {
  if (!game.conscriptsActive) return;
  const amount = game.conscriptsAmount || 1;
  let totalPlaced = 0;
  for (const sector2 of game.gameMap.getAllSectors()) {
    if (sector2.dictatorMilitia > 0) {
      const placed = sector2.addDictatorMilitia(amount);
      totalPlaced += placed;
    }
  }
  if (totalPlaced > 0) {
    game.message(`Conscripts: ${totalPlaced} militia reinforced`);
  }
}
function oilReserves(game) {
  game.oilReservesActive = true;
  game.message("Oil Reserves activated: Controller of oil industry gains 1 free move action");
  return {
    success: true,
    message: "Oil Reserves permanent effect activated"
  };
}
function taintedWater(game) {
  const amount = Math.ceil(game.rebelCount / 2);
  let militiaRemoved = 0;
  let mercsDamaged = 0;
  for (const sector2 of game.gameMap.getAllSectors()) {
    for (const rebel of game.rebelPlayers) {
      const removed = sector2.removeRebelMilitia(`${rebel.position}`, amount);
      militiaRemoved += removed;
    }
  }
  for (const rebel of game.rebelPlayers) {
    for (const merc of rebel.team) {
      merc.damage += 1;
      mercsDamaged++;
      game.message(`${merc.mercName} poisoned by tainted water (1 damage)`);
    }
  }
  game.message(`Tainted water: ${militiaRemoved} militia killed, ${mercsDamaged} MERCs poisoned`);
  return {
    success: true,
    message: `Tainted Water: ${militiaRemoved} militia, ${mercsDamaged} MERCs damaged`,
    data: { militiaRemoved, mercsDamaged }
  };
}
function executeTacticsEffect(game, card) {
  game.message(`Executing tactics: ${card.tacticsName}`);
  game.message(`Effect: ${card.description}`);
  switch (card.tacticsId) {
    case "artillery-barrage":
      return artilleryBarrage(game);
    case "better-weapons":
    case "generalisimo":
    case "lockdown":
    case "veteran-militia":
      return revealBase(game);
    case "family-threat":
      return familyThreat(game);
    case "fodder":
      return fodder(game);
    case "reinforcements":
      return reinforcements(game);
    case "seizure":
      return seizure(game);
    case "sentry":
      return sentry(game);
    case "block-trade":
      return blockTrade(game);
    case "conscripts":
      return conscripts(game);
    case "oil-reserves":
      return oilReserves(game);
    case "tainted-water":
      return taintedWater(game);
    default:
      game.message(`Unknown tactics effect: ${card.tacticsId}`);
      return { success: false, message: `Unknown effect: ${card.tacticsId}` };
  }
}

// src/rules/flow.ts
function createGameFlow(game) {
  return {
    root: sequence(
      // Day 1: The Landing
      phase("landing", {
        do: sequence(
          // Setup message
          execute(() => {
            game.message("=== Day 1: The Landing ===");
            game.currentDay = 1;
          }),
          // MERC-1kq: Designate Privacy Player for AI mode
          actionStep({
            name: "designate-privacy-player",
            actions: ["designatePrivacyPlayer"],
            prompt: "Designate a Privacy Player for AI decisions",
            skipIf: () => !game.dictatorPlayer?.isAI
          }),
          // ===== REBEL PHASE =====
          execute(() => {
            game.message("--- Rebel Phase ---");
          }),
          // Each rebel performs their Day 1 setup
          eachPlayer({
            name: "rebel-landing",
            filter: (player) => game.isRebelPlayer(player),
            // Only rebels, skip dictator
            do: sequence(
              // Step 1: Hire starting MERCs (draw 3, pick 2 in single action, first 2 are free)
              actionStep({
                name: "hire-starting-mercs",
                actions: ["hireStartingMercs"],
                prompt: "Draw 3 MERCs and choose 2 to hire"
              }),
              // Step 2: Choose landing sector
              actionStep({
                name: "place-landing",
                actions: ["placeLanding"],
                prompt: "Choose an edge sector for your landing zone"
              }),
              // Step 3: Equip starting equipment for each MERC
              actionStep({
                name: "equip-first-merc",
                actions: ["equipStarting"],
                prompt: "Choose starting equipment for your first MERC"
              }),
              actionStep({
                name: "equip-second-merc",
                actions: ["equipStarting"],
                prompt: "Choose starting equipment for your second MERC",
                skipIf: (ctx) => {
                  const player = ctx.player;
                  return player.teamSize < 2;
                }
              })
            )
          }),
          // ===== DICTATOR PHASE =====
          execute(() => {
            game.message("--- Dictator Phase ---");
            executeDictatorDay1(game);
          }),
          // Day 1 Complete
          execute(() => {
            game.message(getDay1Summary(game));
          })
        )
      }),
      // Main game loop (Day 2+)
      loop({
        name: "game-loop",
        while: () => !game.isFinished(),
        maxIterations: 1e3,
        do: sequence(
          // Advance the day
          execute(() => {
            game.advanceDay();
            game.message(`Day ${game.currentDay} begins`);
          }),
          // Rebel turns
          eachPlayer({
            name: "rebel-turns",
            filter: (player) => game.isRebelPlayer(player) && !game.isFinished(),
            do: loop({
              name: "rebel-action-loop",
              while: (ctx) => {
                if (game.isFinished()) return false;
                const player = ctx?.player;
                if (player) {
                  const hasActionsLeft = player.team.some((m) => m.actionsRemaining > 0);
                  return hasActionsLeft;
                }
                return true;
              },
              maxIterations: 30,
              // Safety limit per turn
              do: actionStep({
                name: "rebel-action",
                // Per rules (05-main-game-loop.md): Combat triggers via movement, not as separate action
                // MERC-wrq: Added coordinatedAttack for same-player multi-squad attacks
                // MERC-a2h: Added multi-player coordinated attack actions
                // MERC-ttx: splitSquad is free action, available anytime including combat
                // MERC-n1f: Combat actions for interactive retreat choice
                actions: [
                  "combatContinue",
                  // MERC-n1f: Continue active combat (highest priority)
                  "combatRetreat",
                  // MERC-n1f: Retreat from active combat
                  "move",
                  "coordinatedAttack",
                  // MERC-wrq: Same player, both squads
                  "declareCoordinatedAttack",
                  // MERC-a2h: Stage for multi-player attack
                  "joinCoordinatedAttack",
                  // MERC-a2h: Join declared attack
                  "executeCoordinatedAttack",
                  // MERC-a2h: Execute multi-player attack
                  "explore",
                  "train",
                  "hireMerc",
                  "reEquip",
                  "hospital",
                  "docHeal",
                  // MERC-m4k: Doc's free heal ability
                  "feedbackDiscard",
                  // MERC-24h: Feedback discard retrieval
                  "squidheadDisarm",
                  // MERC-4qd: Squidhead disarm mines
                  "squidheadArm",
                  // MERC-4qd: Squidhead arm mines
                  "hagnessDraw",
                  // MERC-jrph: Hagness draw equipment
                  "armsDealer",
                  "splitSquad",
                  // MERC-ttx: Free action available anytime
                  "mergeSquads",
                  "fireMerc",
                  "endTurn"
                ],
                skipIf: () => game.isFinished()
              })
            })
          }),
          // Dictator turn
          // Per rules (05-main-game-loop.md):
          // Step 1: Play Tactics card OR Reinforce
          // Step 2: Each Dictator MERC takes 2 actions
          // Step 3: Use Special Ability (if applicable)
          // Step 4: Refill hand to 3 cards
          phase("dictator-turn", {
            do: sequence(
              execute(() => {
                game.message("--- Dictator Turn ---");
              }),
              // Step 1: Play a tactics card or reinforce
              actionStep({
                name: "dictator-play-tactics",
                actions: ["playTactics", "reinforce"],
                skipIf: () => game.isFinished()
              }),
              // Step 2: Dictator MERC actions (if any MERCs)
              loop({
                name: "dictator-merc-actions",
                while: () => {
                  const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
                  const dictator = game.dictatorPlayer?.dictator;
                  const hasActionsLeft = dictatorMercs.some((m) => m.actionsRemaining > 0) || dictator?.inPlay && dictator.actionsRemaining > 0;
                  return hasActionsLeft && !game.isFinished();
                },
                maxIterations: 20,
                do: actionStep({
                  name: "dictator-merc-action",
                  actions: [
                    "dictatorMortar",
                    // MERC-9m9: Mortar attack (high priority per rules 4.12)
                    "dictatorHeal",
                    // MERC-7fy: Heal injured MERCs (priority per rules 4.8)
                    "dictatorMove",
                    "dictatorExplore",
                    "dictatorTrain",
                    "dictatorReEquip",
                    "dictatorEndMercActions"
                  ],
                  skipIf: () => game.isFinished()
                })
              }),
              // Move militia (free action)
              actionStep({
                name: "dictator-militia-movement",
                actions: ["moveMilitia", "skipMilitiaMove"],
                skipIf: () => game.isFinished()
              }),
              // Step 3: Apply per-turn dictator special ability
              execute(() => {
                applyDictatorTurnAbilities(game);
              }),
              // Apply end-of-turn effects (Conscripts)
              execute(() => {
                applyConscriptsEffect(game);
              }),
              // Step 4: Refill hand to 3 cards
              execute(() => {
                drawTacticsHand(game);
              })
            )
          })
        )
      })
    ),
    isComplete: () => game.isFinished(),
    getWinners: () => game.getWinners()
  };
}

// src/rules/actions.ts
init_dist();
init_elements();
init_constants();
init_ai_helpers();

// src/rules/ai-executor.ts
init_elements();
init_ai_helpers();
function checkAISpecialAbilities(game) {
  const mercsWithAbilities = getAIAbilityActivations(game.dictatorPlayer.hiredMercs);
  for (const merc of mercsWithAbilities) {
    if (shouldUseSpecialAbility(merc, "turn-start")) {
      game.message(`AI considers using ${merc.mercName}'s ability: ${merc.ability}`);
    }
  }
  const dictator = game.dictatorPlayer.dictator;
  if (dictator?.inPlay && dictator.ability) {
    game.message(`AI considers using Dictator ability: ${dictator.ability}`);
  }
}
function checkAIHealing(game) {
  const allMercs = game.dictatorPlayer.hiredMercs.filter((m) => !m.isDead);
  const damagedMercs = allMercs.filter((m) => mercNeedsHealing(m));
  if (damagedMercs.length === 0) return null;
  const healingAction = getAIHealingPriority(game, damagedMercs, allMercs);
  if (!healingAction) return null;
  if (healingAction.type === "repairKit" && healingAction.sector) {
    const success = useRepairKit(game, healingAction.sector, healingAction.target);
    if (success) {
      return null;
    }
  }
  game.message(`AI considers healing ${healingAction.target.mercName} using ${healingAction.type}`);
  if (healingAction.type === "item" && healingAction.merc) {
    return null;
  }
  return null;
}
function getNextAIAction(game) {
  if (!game.dictatorPlayer?.isAI) {
    return null;
  }
  checkAISpecialAbilities(game);
  const healingAction = checkAIHealing(game);
  if (healingAction) {
    return healingAction;
  }
  const mercs = game.dictatorPlayer.hiredMercs.filter(
    (m) => !m.isDead && m.actionsRemaining > 0 && m.sectorId
  );
  const dictator = game.dictatorPlayer.dictator;
  const dictatorCanAct = dictator?.inPlay && dictator.actionsRemaining > 0 && dictator.sectorId;
  if (mercs.length === 0 && !dictatorCanAct) {
    return {
      actionName: "dictatorEndMercActions",
      unit: null,
      reason: "No units with actions remaining"
    };
  }
  const sortedMercs = sortMercsByInitiative(mercs);
  if (dictatorCanAct && isDictatorAtBase(game)) {
    const dictatorAction = getDictatorAction(game, dictator);
    if (dictatorAction) {
      return dictatorAction;
    }
  }
  for (const merc of sortedMercs) {
    const decision = getAIMercAction(game, merc);
    const actionSelection = convertDecisionToAction(game, merc, decision);
    if (actionSelection && actionSelection.actionName !== "none") {
      return actionSelection;
    }
  }
  if (dictatorCanAct && !isDictatorAtBase(game)) {
    const dictatorAction = getDictatorAction(game, dictator);
    if (dictatorAction) {
      return dictatorAction;
    }
  }
  return {
    actionName: "dictatorEndMercActions",
    unit: null,
    reason: "All units have acted"
  };
}
function getDictatorAction(game, dictator) {
  const sector2 = dictator.sectorId ? game.getSector(dictator.sectorId) : null;
  if (!sector2) return null;
  const validActions = getDictatorBaseActions();
  if (validActions.includes("explore") && !sector2.explored) {
    return {
      actionName: "dictatorExplore",
      unit: dictator,
      reason: "Dictator exploring sector"
    };
  }
  if (validActions.includes("re-equip")) {
    const stash = sector2.getStashContents();
    const usableEquipment = stash.filter((e) => !shouldLeaveInStash(e));
    if (usableEquipment.length > 0) {
      const sorted = sortEquipmentByAIPriority(usableEquipment);
      for (const equip of sorted) {
        if (dictator.canEquip && dictator.canEquip(equip.equipmentType)) {
          const current = dictator.getEquipmentOfType?.(equip.equipmentType);
          if (!current || (equip.serial || 0) > (current.serial || 0)) {
            return {
              actionName: "dictatorReEquip",
              unit: dictator,
              equipment: equip,
              reason: "Dictator equipping from stash"
            };
          }
        }
      }
    }
  }
  if (validActions.includes("train") && dictator.training > 0) {
    if (sector2.dictatorMilitia < 10) {
      return {
        actionName: "dictatorTrain",
        unit: dictator,
        reason: "Dictator training militia at base"
      };
    }
  }
  return null;
}
function convertDecisionToAction(game, merc, decision) {
  const sector2 = merc.sectorId ? game.getSector(merc.sectorId) : null;
  if (!sector2) return null;
  switch (decision.action) {
    case "explore":
      if (!sector2.explored && merc.actionsRemaining >= 1) {
        return {
          actionName: "dictatorExplore",
          unit: merc,
          reason: decision.reason
        };
      }
      break;
    case "re-equip":
      const stash = sector2.getStashContents();
      const usableEquipment = stash.filter((e) => !shouldLeaveInStash(e));
      if (usableEquipment.length > 0) {
        const sorted = sortEquipmentByAIPriority(usableEquipment);
        for (const equip of sorted) {
          if (merc.canEquip(equip.equipmentType)) {
            const current = merc.getEquipmentOfType(equip.equipmentType);
            if (!current || (equip.serial || 0) > (current.serial || 0)) {
              return {
                actionName: "dictatorReEquip",
                unit: merc,
                equipment: equip,
                reason: decision.reason
              };
            }
          }
        }
      }
      break;
    case "train":
      if (merc.training > 0 && sector2.dictatorMilitia < 10 && merc.actionsRemaining >= 1) {
        return {
          actionName: "dictatorTrain",
          unit: merc,
          reason: decision.reason
        };
      }
      break;
    case "move":
      if (merc.actionsRemaining >= 1) {
        if (!canSquadMoveTogether(game, sector2.sectorId)) {
          if (sector2.dictatorMilitia < 10 && merc.training > 0) {
            return {
              actionName: "dictatorTrain",
              unit: merc,
              reason: "MERC-az8: Squad cannot move together, train instead"
            };
          }
          break;
        }
        const destination = decision.target || getBestMoveDirection(game, sector2);
        if (destination) {
          return {
            actionName: "dictatorMove",
            unit: merc,
            destination,
            reason: decision.reason
          };
        }
      }
      break;
  }
  return null;
}
function getAIMoveDestination(game, unit) {
  if (!unit.sectorId) return null;
  const sector2 = game.getSector(unit.sectorId);
  if (!sector2) return null;
  if (unit instanceof MercCard) {
    const decision = getAIMercAction(game, unit);
    if (decision.action === "move" && decision.target) {
      return decision.target;
    }
  }
  return getBestMoveDirection(game, sector2);
}
function getAIEquipmentSelection(game, unit) {
  if (!unit.sectorId) return null;
  const sector2 = game.getSector(unit.sectorId);
  if (!sector2) return null;
  const stash = sector2.getStashContents();
  const usableEquipment = stash.filter((e) => !shouldLeaveInStash(e));
  const sorted = sortEquipmentByAIPriority(usableEquipment);
  for (const equip of sorted) {
    if (unit.canEquip(equip.equipmentType)) {
      const current = unit.getEquipmentOfType(equip.equipmentType);
      if (!current || (equip.serial || 0) > (current.serial || 0)) {
        return equip;
      }
    }
  }
  return null;
}

// src/rules/actions.ts
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
var ACTION_COSTS = {
  MOVE: 1,
  EXPLORE: 1,
  TRAIN: 1,
  // ATTACK removed - combat triggers via movement only
  HOSPITAL: 1,
  ARMS_DEALER: 1,
  HIRE_MERC: 2,
  // Per rules: "Hire MERCs (2 actions)"
  RE_EQUIP: 1,
  // Per rules: "Re-Equip (1 action)"
  SPLIT_SQUAD: 0,
  // Free action
  MERGE_SQUADS: 0
  // Free action
};
var MERC_INCOMPATIBILITIES = {
  borris: ["squirrel"],
  squirrel: ["borris", "natasha"],
  natasha: ["moose"],
  moose: ["borris"]
};
function canHireMercWithTeam(mercId, team) {
  const incompatible = MERC_INCOMPATIBILITIES[mercId] || [];
  return !team.some((m) => incompatible.includes(m.mercId));
}
function hasActionsRemaining(player, cost) {
  return player.team.some((merc) => merc.actionsRemaining >= cost);
}
function useAction(merc, cost) {
  return merc.useAction(cost);
}
function createHireMercAction(game) {
  const drawnMercsCache = /* @__PURE__ */ new Map();
  return Action.create("hireMerc").prompt("Hire mercenaries").condition((ctx) => {
    const player = ctx.player;
    if (!player.canHireMerc(game)) return false;
    if (!hasActionsRemaining(player, ACTION_COSTS.HIRE_MERC)) return false;
    return game.mercDeck.count(MercCard) > 0;
  }).chooseElement("actingMerc", {
    prompt: "Which MERC spends the actions?",
    elementClass: MercCard,
    display: (merc) => capitalize(merc.mercName),
    filter: (element, ctx) => {
      const merc = element;
      const player = ctx.player;
      return player.team.includes(merc) && merc.actionsRemaining >= ACTION_COSTS.HIRE_MERC;
    }
  }).chooseFrom("fireFirst", {
    prompt: "Fire a MERC first? (frees team slot)",
    choices: (ctx) => {
      const player = ctx.player;
      const choices = [
        { label: "No, continue hiring", value: "none" }
      ];
      if (player.teamSize >= 2) {
        for (const merc of player.team) {
          choices.push({ label: `Fire ${merc.mercName}`, value: merc.mercName });
        }
      }
      return choices;
    }
  }).chooseFrom("selectedMercs", {
    prompt: "Select MERCs to hire (multi-select)",
    multiSelect: true,
    choices: (ctx) => {
      const player = ctx.player;
      const cacheKey = `${player.position}`;
      if (!drawnMercsCache.has(cacheKey)) {
        const drawn = drawMercsForHiring(game, 3);
        drawnMercsCache.set(cacheKey, drawn);
      }
      const drawnMercs = drawnMercsCache.get(cacheKey) || [];
      const fireChoice = ctx.data?.fireFirst;
      const willFire = fireChoice && fireChoice !== "none";
      const teamLimit = player.getTeamLimit(game);
      const currentSize = player.teamSize - (willFire ? 1 : 0);
      const canHire = teamLimit - currentSize;
      const compatibleMercs = drawnMercs.filter(
        (m) => canHireMercWithTeam(m.mercId, player.team)
      );
      const choices = compatibleMercs.map((m) => capitalize(m.mercName));
      if (canHire < compatibleMercs.length) {
        game.message(`Team limit: can hire up to ${canHire} MERC(s)`);
      }
      return choices;
    }
  }).execute((args, ctx) => {
    const player = ctx.player;
    const actingMerc = args.actingMerc;
    const cacheKey = `${player.position}`;
    const drawnMercs = drawnMercsCache.get(cacheKey) || [];
    const selectedNames = args.selectedMercs || [];
    const fireChoice = args.fireFirst;
    if (!useAction(actingMerc, ACTION_COSTS.HIRE_MERC)) {
      for (const merc of drawnMercs) {
        merc.putInto(game.mercDiscard);
      }
      drawnMercsCache.delete(cacheKey);
      return { success: false, message: "Not enough actions" };
    }
    if (fireChoice && fireChoice !== "none") {
      const mercToFire = player.team.find((m) => m.mercName === fireChoice);
      if (mercToFire && mercToFire !== actingMerc) {
        const firedSquad = player.primarySquad.getMercs().includes(mercToFire) ? player.primarySquad : player.secondarySquad;
        const sector2 = firedSquad?.sectorId ? game.getSector(firedSquad.sectorId) : null;
        const droppedEquipment = [];
        if (mercToFire.weaponSlot) {
          const weapon = mercToFire.unequip("Weapon");
          if (weapon && sector2) {
            sector2.addToStash(weapon);
            droppedEquipment.push(weapon.equipmentName);
          }
        }
        if (mercToFire.armorSlot) {
          const armor = mercToFire.unequip("Armor");
          if (armor && sector2) {
            sector2.addToStash(armor);
            droppedEquipment.push(armor.equipmentName);
          }
        }
        if (mercToFire.accessorySlot) {
          const accessory = mercToFire.unequip("Accessory");
          if (accessory && sector2) {
            sector2.addToStash(accessory);
            droppedEquipment.push(accessory.equipmentName);
          }
        }
        mercToFire.putInto(game.mercDiscard);
        if (droppedEquipment.length > 0) {
          game.message(`Fired ${mercToFire.mercName}, dropped ${droppedEquipment.join(", ")} to stash`);
        } else {
          game.message(`Fired ${mercToFire.mercName}`);
        }
      }
    }
    const teamLimit = player.getTeamLimit(game);
    let currentSize = player.teamSize;
    const hired = [];
    let targetSquad = player.primarySquad;
    if (player.primarySquad.mercCount === 0 && player.secondarySquad.mercCount > 0) {
      targetSquad = player.secondarySquad;
    }
    for (const merc of drawnMercs) {
      if (selectedNames.includes(capitalize(merc.mercName)) && currentSize < teamLimit) {
        merc.putInto(targetSquad);
        merc.actionsRemaining = 0;
        let equipType;
        if (!merc.weaponSlot) {
          equipType = "Weapon";
        } else if (!merc.armorSlot) {
          equipType = "Armor";
        } else if (!merc.accessorySlot) {
          equipType = "Accessory";
        } else {
          const types = ["Weapon", "Armor", "Accessory"];
          equipType = types[Math.floor(Math.random() * types.length)];
        }
        const freeEquipment = game.drawEquipment(equipType);
        if (freeEquipment) {
          const replaced = merc.equip(freeEquipment);
          if (replaced) {
            const sector2 = targetSquad?.sectorId ? game.getSector(targetSquad.sectorId) : null;
            if (sector2) {
              sector2.addToStash(replaced);
            } else {
              const discard = game.getEquipmentDiscard(replaced.equipmentType);
              if (discard) replaced.putInto(discard);
            }
          }
          game.message(`${merc.mercName} equipped free ${freeEquipment.equipmentName}`);
        }
        if (merc.mercId === "vrbansk" && !merc.accessorySlot) {
          const freeAccessory = game.drawEquipment("Accessory");
          if (freeAccessory) {
            merc.equip(freeAccessory);
            game.message(`${merc.mercName} receives bonus accessory: ${freeAccessory.equipmentName}`);
          }
        }
        hired.push(merc.mercName);
        currentSize++;
      } else {
        merc.putInto(game.mercDiscard);
      }
    }
    drawnMercsCache.delete(cacheKey);
    if (hired.length > 0) {
      game.message(`${player.name} hired: ${hired.join(", ")}`);
      return { success: true, message: `Hired ${hired.length} MERC(s)`, data: { hired } };
    } else {
      game.message(`${player.name} hired no MERCs`);
      return { success: true, message: "No MERCs hired" };
    }
  });
}
function createMoveAction(game) {
  return Action.create("move").prompt("Move your squad").chooseElement("squad", {
    prompt: "Select squad to move",
    elementClass: Squad,
    filter: (element, ctx) => {
      const squad = element;
      const player = ctx.player;
      if (squad !== player.primarySquad && squad !== player.secondarySquad) return false;
      if (!squad.sectorId) return false;
      const mercs = squad.getMercs();
      return mercs.length > 0 && mercs.every((m) => m.actionsRemaining >= ACTION_COSTS.MOVE);
    }
  }).chooseElement("destination", {
    prompt: "Select destination sector",
    elementClass: Sector,
    filter: (element, ctx) => {
      const sector2 = element;
      const squad = ctx.args.squad;
      if (!squad?.sectorId) return false;
      const currentSector = game.getSector(squad.sectorId);
      if (!currentSector) return false;
      const adjacent = game.getAdjacentSectors(currentSector);
      return adjacent.some((s) => s.sectorId === sector2.sectorId);
    },
    boardRef: (element) => ({ id: element.id })
  }).execute((args, ctx) => {
    const player = ctx.player;
    const squad = args.squad;
    const destination = args.destination;
    const sourceSector = game.getSector(squad.sectorId);
    const mercs = squad.getMercs();
    for (const merc of mercs) {
      useAction(merc, ACTION_COSTS.MOVE);
    }
    let militiaMoved = 0;
    if (sourceSector) {
      const hasSonia = mercs.some((m) => m.mercId === "sonia");
      if (hasSonia) {
        const playerId = `${player.position}`;
        const militiaAvailable = sourceSector.getRebelMilitia(playerId);
        militiaMoved = Math.min(2, militiaAvailable);
        if (militiaMoved > 0) {
          sourceSector.removeRebelMilitia(playerId, militiaMoved);
          destination.addRebelMilitia(playerId, militiaMoved);
          game.message(`Sonia brings ${militiaMoved} militia along`);
        }
      }
    }
    squad.sectorId = destination.sectorId;
    game.message(`${player.name} moved ${mercs.length} MERC(s) to ${destination.sectorName}`);
    if (hasEnemies(game, destination, player)) {
      game.message(`Enemies detected at ${destination.sectorName} - combat begins!`);
      const outcome = executeCombat(game, destination, player);
      return {
        success: true,
        message: `Moved to ${destination.sectorName} and engaged in combat`,
        data: {
          combatTriggered: true,
          rebelVictory: outcome.rebelVictory,
          dictatorVictory: outcome.dictatorVictory
        }
      };
    }
    return { success: true, message: `Moved to ${destination.sectorName}` };
  });
}
function createCoordinatedAttackAction(game) {
  return Action.create("coordinatedAttack").prompt("Coordinated attack (both squads)").condition((ctx) => {
    const player = ctx.player;
    if (player.primarySquad.mercCount === 0 || player.secondarySquad.mercCount === 0) return false;
    if (!player.primarySquad.sectorId || !player.secondarySquad.sectorId) return false;
    const primaryMercs = player.primarySquad.getMercs();
    const secondaryMercs = player.secondarySquad.getMercs();
    if (!primaryMercs.every((m) => m.actionsRemaining >= ACTION_COSTS.MOVE)) return false;
    if (!secondaryMercs.every((m) => m.actionsRemaining >= ACTION_COSTS.MOVE)) return false;
    const primarySector = game.getSector(player.primarySquad.sectorId);
    const secondarySector = game.getSector(player.secondarySquad.sectorId);
    if (!primarySector || !secondarySector) return false;
    const primaryAdjacent = game.getAdjacentSectors(primarySector);
    const secondaryAdjacent = game.getAdjacentSectors(secondarySector);
    const commonTargets = primaryAdjacent.filter(
      (s) => secondaryAdjacent.some((s2) => s2.sectorId === s.sectorId)
    );
    return commonTargets.length > 0;
  }).chooseElement("target", {
    prompt: "Select target sector for coordinated attack",
    elementClass: Sector,
    filter: (element, ctx) => {
      const sector2 = element;
      const player = ctx.player;
      const primarySector = game.getSector(player.primarySquad.sectorId);
      const secondarySector = game.getSector(player.secondarySquad.sectorId);
      if (!primarySector || !secondarySector) return false;
      const primaryAdjacent = game.getAdjacentSectors(primarySector);
      const secondaryAdjacent = game.getAdjacentSectors(secondarySector);
      return primaryAdjacent.some((s) => s.sectorId === sector2.sectorId) && secondaryAdjacent.some((s) => s.sectorId === sector2.sectorId);
    },
    boardRef: (element) => ({ id: element.id })
  }).execute((args, ctx) => {
    const player = ctx.player;
    const target = args.target;
    const primaryMercs = player.primarySquad.getMercs();
    const secondaryMercs = player.secondarySquad.getMercs();
    for (const merc of [...primaryMercs, ...secondaryMercs]) {
      useAction(merc, ACTION_COSTS.MOVE);
    }
    player.primarySquad.sectorId = target.sectorId;
    player.secondarySquad.sectorId = target.sectorId;
    const totalMercs = primaryMercs.length + secondaryMercs.length;
    game.message(`${player.name} launches coordinated attack with ${totalMercs} MERC(s) on ${target.sectorName}!`);
    if (hasEnemies(game, target, player)) {
      game.message(`Combat begins with coordinated rebel forces!`);
      const outcome = executeCombat(game, target, player);
      return {
        success: true,
        message: `Coordinated attack on ${target.sectorName}`,
        data: {
          combatTriggered: true,
          coordinatedAttack: true,
          rebelVictory: outcome.rebelVictory,
          dictatorVictory: outcome.dictatorVictory
        }
      };
    }
    return { success: true, message: `Both squads moved to ${target.sectorName}` };
  });
}
function createDeclareCoordinatedAttackAction(game) {
  return Action.create("declareCoordinatedAttack").prompt("Declare coordinated attack (stage for multi-player)").condition((ctx) => {
    const player = ctx.player;
    const hasValidSquad = [player.primarySquad, player.secondarySquad].some((squad) => {
      if (squad.mercCount === 0 || !squad.sectorId) return false;
      const sector2 = game.getSector(squad.sectorId);
      if (!sector2) return false;
      const adjacent = game.getAdjacentSectors(sector2);
      return adjacent.some((s) => hasEnemies(game, s, player));
    });
    return hasValidSquad;
  }).chooseElement("squad", {
    prompt: "Select squad to stage for coordinated attack",
    elementClass: Squad,
    filter: (element, ctx) => {
      const squad = element;
      const player = ctx.player;
      if (squad !== player.primarySquad && squad !== player.secondarySquad) return false;
      if (squad.mercCount === 0 || !squad.sectorId) return false;
      return squad.getMercs().every((m) => m.actionsRemaining >= ACTION_COSTS.MOVE);
    }
  }).chooseElement("target", {
    prompt: "Select target sector for coordinated attack",
    elementClass: Sector,
    filter: (element, ctx) => {
      const sector2 = element;
      const player = ctx.player;
      const squad = ctx.args.squad;
      if (!squad?.sectorId) return false;
      const currentSector = game.getSector(squad.sectorId);
      if (!currentSector) return false;
      const adjacent = game.getAdjacentSectors(currentSector);
      return adjacent.some((s) => s.sectorId === sector2.sectorId) && hasEnemies(game, sector2, player);
    },
    boardRef: (element) => ({ id: element.id })
  }).execute((args, ctx) => {
    const player = ctx.player;
    const squad = args.squad;
    const target = args.target;
    const squadType = squad === player.primarySquad ? "primary" : "secondary";
    game.declareCoordinatedAttack(target.sectorId, `${player.position}`, squadType);
    const pending = game.getPendingCoordinatedAttack(target.sectorId);
    game.message(`${player.name}'s ${squadType} squad staged for coordinated attack on ${target.sectorName} (${pending.length} squad(s) ready)`);
    return {
      success: true,
      message: `Staged for coordinated attack`,
      data: { targetSector: target.sectorId, pendingCount: pending.length }
    };
  });
}
function createJoinCoordinatedAttackAction(game) {
  return Action.create("joinCoordinatedAttack").prompt("Join coordinated attack").condition((ctx) => {
    const player = ctx.player;
    if (game.pendingCoordinatedAttacks.size === 0) return false;
    for (const [targetId] of game.pendingCoordinatedAttacks) {
      const targetSector = game.getSector(targetId);
      if (!targetSector) continue;
      for (const squad of [player.primarySquad, player.secondarySquad]) {
        if (squad.mercCount === 0 || !squad.sectorId) continue;
        const sector2 = game.getSector(squad.sectorId);
        if (!sector2) continue;
        const adjacent = game.getAdjacentSectors(sector2);
        if (adjacent.some((s) => s.sectorId === targetId)) {
          if (squad.getMercs().every((m) => m.actionsRemaining >= ACTION_COSTS.MOVE)) {
            return true;
          }
        }
      }
    }
    return false;
  }).chooseFrom("targetAttack", {
    prompt: "Select coordinated attack to join",
    choices: () => {
      const choices = [];
      for (const [targetId, participants] of game.pendingCoordinatedAttacks) {
        const sector2 = game.getSector(targetId);
        if (sector2) {
          choices.push({
            label: `Attack on ${sector2.sectorName} (${participants.length} squad(s) ready)`,
            value: targetId
          });
        }
      }
      return choices;
    }
  }).chooseElement("squad", {
    prompt: "Select squad to join the attack",
    elementClass: Squad,
    filter: (element, ctx) => {
      const squad = element;
      const player = ctx.player;
      const targetId = ctx.data?.targetAttack;
      if (squad !== player.primarySquad && squad !== player.secondarySquad) return false;
      if (squad.mercCount === 0 || !squad.sectorId) return false;
      const sector2 = game.getSector(squad.sectorId);
      if (!sector2) return false;
      const adjacent = game.getAdjacentSectors(sector2);
      if (!adjacent.some((s) => s.sectorId === targetId)) return false;
      return squad.getMercs().every((m) => m.actionsRemaining >= ACTION_COSTS.MOVE);
    }
  }).execute((args, ctx) => {
    const player = ctx.player;
    const squad = args.squad;
    const targetId = args.targetAttack;
    const squadType = squad === player.primarySquad ? "primary" : "secondary";
    game.declareCoordinatedAttack(targetId, `${player.position}`, squadType);
    const pending = game.getPendingCoordinatedAttack(targetId);
    const target = game.getSector(targetId);
    game.message(`${player.name}'s ${squadType} squad joined coordinated attack on ${target?.sectorName} (${pending.length} squad(s) ready)`);
    return {
      success: true,
      message: `Joined coordinated attack`,
      data: { targetSector: targetId, pendingCount: pending.length }
    };
  });
}
function createExecuteCoordinatedAttackAction(game) {
  return Action.create("executeCoordinatedAttack").prompt("Execute coordinated attack").condition((ctx) => {
    const player = ctx.player;
    for (const [, participants] of game.pendingCoordinatedAttacks) {
      if (participants.some((p) => p.playerId === `${player.position}`)) {
        return true;
      }
    }
    return false;
  }).chooseFrom("targetAttack", {
    prompt: "Select coordinated attack to execute",
    choices: (ctx) => {
      const player = ctx.player;
      const choices = [];
      for (const [targetId, participants] of game.pendingCoordinatedAttacks) {
        if (participants.some((p) => p.playerId === `${player.position}`)) {
          const sector2 = game.getSector(targetId);
          if (sector2) {
            choices.push({
              label: `Attack on ${sector2.sectorName} (${participants.length} squad(s))`,
              value: targetId
            });
          }
        }
      }
      return choices;
    }
  }).execute((args, ctx) => {
    const targetId = args.targetAttack;
    const target = game.getSector(targetId);
    if (!target) {
      return { success: false, message: "Target sector not found" };
    }
    const participants = game.getPendingCoordinatedAttack(targetId);
    if (participants.length === 0) {
      return { success: false, message: "No participants in coordinated attack" };
    }
    const allMercs = [];
    const participantNames = [];
    for (const { playerId, squadType } of participants) {
      const rebel = game.rebelPlayers.find((r) => `${r.position}` === playerId);
      if (!rebel) continue;
      const squad = squadType === "primary" ? rebel.primarySquad : rebel.secondarySquad;
      const mercs = squad.getMercs();
      for (const merc of mercs) {
        useAction(merc, ACTION_COSTS.MOVE);
        allMercs.push(merc);
      }
      squad.sectorId = targetId;
      participantNames.push(`${rebel.name} (${mercs.length} MERC${mercs.length > 1 ? "s" : ""})`);
    }
    game.clearCoordinatedAttack(targetId);
    game.message(`Coordinated attack launched on ${target.sectorName}! Participants: ${participantNames.join(", ")}`);
    if (hasEnemies(game, target, game.rebelPlayers[0])) {
      game.message(`Combat begins with ${allMercs.length} attacking MERC(s)!`);
      const outcome = executeCombat(game, target, game.rebelPlayers[0]);
      return {
        success: true,
        message: `Coordinated attack executed`,
        data: {
          combatTriggered: true,
          coordinatedAttack: true,
          participantCount: participants.length,
          totalMercs: allMercs.length,
          rebelVictory: outcome.rebelVictory,
          dictatorVictory: outcome.dictatorVictory
        }
      };
    }
    return {
      success: true,
      message: `All squads moved to ${target.sectorName}`,
      data: { participantCount: participants.length, totalMercs: allMercs.length }
    };
  });
}
function createExploreAction(game) {
  const explorationCache = /* @__PURE__ */ new Map();
  return Action.create("explore").prompt("Explore the current sector").condition((ctx) => {
    const player = ctx.player;
    const squad = player.primarySquad;
    if (!squad?.sectorId) return false;
    const sector2 = game.getSector(squad.sectorId);
    if (!sector2 || sector2.explored) return false;
    return hasActionsRemaining(player, ACTION_COSTS.EXPLORE);
  }).chooseElement("actingMerc", {
    prompt: "Which MERC explores?",
    elementClass: MercCard,
    display: (merc) => capitalize(merc.mercName),
    filter: (element, ctx) => {
      const merc = element;
      const player = ctx.player;
      return player.team.includes(merc) && merc.actionsRemaining >= ACTION_COSTS.EXPLORE;
    }
  }).chooseFrom("equipChoices", {
    prompt: "Free Re-Equip: Select equipment to distribute (multi-select)",
    multiSelect: true,
    choices: (ctx) => {
      const player = ctx.player;
      const squad = player.primarySquad;
      const sector2 = game.getSector(squad.sectorId);
      if (!sector2) return [];
      if (!sector2.explored) {
        sector2.explore();
        const drawnEquipment = [];
        for (let i = 0; i < sector2.weaponLoot; i++) {
          const weapon = game.drawEquipment("Weapon");
          if (weapon) {
            sector2.addToStash(weapon);
            drawnEquipment.push(weapon);
          }
        }
        for (let i = 0; i < sector2.armorLoot; i++) {
          const armor = game.drawEquipment("Armor");
          if (armor) {
            sector2.addToStash(armor);
            drawnEquipment.push(armor);
          }
        }
        for (let i = 0; i < sector2.accessoryLoot; i++) {
          const accessory = game.drawEquipment("Accessory");
          if (accessory) {
            sector2.addToStash(accessory);
            drawnEquipment.push(accessory);
          }
        }
        if (sector2.isIndustry) {
          const types = ["Weapon", "Armor", "Accessory"];
          const randomType = types[Math.floor(Math.random() * types.length)];
          const bonusEquipment = game.drawEquipment(randomType);
          if (bonusEquipment) {
            sector2.addToStash(bonusEquipment);
            drawnEquipment.push(bonusEquipment);
            game.message(`Industry bonus: found ${bonusEquipment.equipmentName}!`);
          }
        }
        game.message(`Explored ${sector2.sectorName} and found ${drawnEquipment.length} equipment`);
        explorationCache.set(`${player.position}`, { sector: sector2, equipment: drawnEquipment });
      }
      const choices = [];
      for (let i = 0; i < sector2.stash.length; i++) {
        const equip = sector2.stash[i];
        choices.push(`${i + 1}. ${equip.equipmentName} (${equip.equipmentType})`);
      }
      return choices;
    }
  }).chooseFrom("equipAssignments", {
    prompt: "Assign selected equipment to MERCs (format: MERC name for each item)",
    multiSelect: true,
    choices: (ctx) => {
      const player = ctx.player;
      const equipChoices = ctx.data?.equipChoices || [];
      if (equipChoices.length === 0) {
        return ["Skip"];
      }
      return player.team.map((m) => m.mercName);
    },
    skipIf: (ctx) => {
      const equipChoices = ctx.data?.equipChoices || [];
      return equipChoices.length === 0;
    }
  }).chooseFrom("freeTrade", {
    prompt: "Free Trade: Transfer equipment between MERCs? (no action cost)",
    choices: (ctx) => {
      const player = ctx.player;
      const hasEquippedMercs = player.team.some(
        (m) => m.weaponSlot || m.armorSlot || m.accessorySlot
      );
      if (player.teamSize < 2 || !hasEquippedMercs) {
        return [{ label: "No trades needed", value: "skip" }];
      }
      return [
        { label: "Yes, trade equipment", value: "trade" },
        { label: "No trades needed", value: "skip" }
      ];
    }
  }).chooseElement("tradeGiver", {
    prompt: "Select MERC to give equipment",
    elementClass: MercCard,
    display: (merc) => capitalize(merc.mercName),
    filter: (element, ctx) => {
      const merc = element;
      const player = ctx.player;
      return player.team.includes(merc) && (merc.weaponSlot || merc.armorSlot || merc.accessorySlot);
    },
    skipIf: (ctx) => ctx.data?.freeTrade !== "trade"
  }).chooseFrom("tradeEquipment", {
    prompt: "Which equipment to give?",
    choices: (ctx) => {
      const giver = ctx.args?.tradeGiver;
      const choices = [];
      if (giver?.weaponSlot) choices.push(`Weapon: ${giver.weaponSlot.equipmentName}`);
      if (giver?.armorSlot) choices.push(`Armor: ${giver.armorSlot.equipmentName}`);
      if (giver?.accessorySlot) choices.push(`Accessory: ${giver.accessorySlot.equipmentName}`);
      return choices;
    },
    skipIf: (ctx) => ctx.data?.freeTrade !== "trade"
  }).chooseElement("tradeReceiver", {
    prompt: "Select MERC to receive equipment",
    elementClass: MercCard,
    display: (merc) => capitalize(merc.mercName),
    filter: (element, ctx) => {
      const merc = element;
      const player = ctx.player;
      const giver = ctx.args?.tradeGiver;
      return player.team.includes(merc) && merc !== giver;
    },
    skipIf: (ctx) => ctx.data?.freeTrade !== "trade"
  }).execute((args, ctx) => {
    const player = ctx.player;
    const actingMerc = args.actingMerc;
    const squad = player.primarySquad;
    const sector2 = game.getSector(squad.sectorId);
    if (!sector2) {
      return { success: false, message: "No sector found" };
    }
    useAction(actingMerc, ACTION_COSTS.EXPLORE);
    const equipChoices = args.equipChoices || [];
    const equipAssignments = args.equipAssignments || [];
    const equipped = [];
    for (let i = 0; i < equipChoices.length; i++) {
      const choice = equipChoices[i];
      const mercName = equipAssignments[i] || equipAssignments[0];
      if (!mercName || mercName === "Skip") continue;
      const equipIndex = parseInt(choice.split(".")[0], 10) - 1;
      if (equipIndex < 0 || equipIndex >= sector2.stash.length) continue;
      const equipment = sector2.stash[equipIndex];
      const merc = player.team.find((m) => m.mercName === mercName);
      if (equipment && merc) {
        const currentIdx = sector2.stash.indexOf(equipment);
        if (currentIdx >= 0) {
          sector2.stash.splice(currentIdx, 1);
          const replaced = merc.equip(equipment);
          if (replaced) {
            sector2.addToStash(replaced);
            game.message(`${merc.mercName} equipped ${equipment.equipmentName}, returned ${replaced.equipmentName} to stash`);
          } else {
            game.message(`${merc.mercName} equipped ${equipment.equipmentName}`);
          }
          equipped.push(`${merc.mercName}: ${equipment.equipmentName}`);
        }
      }
    }
    const freeTrade = args.freeTrade;
    let tradeResult = "";
    if (freeTrade === "trade") {
      const giver = args.tradeGiver;
      const receiver = args.tradeReceiver;
      const tradeEquipmentStr = args.tradeEquipment;
      if (giver && receiver && tradeEquipmentStr) {
        let equipmentToTrade;
        let slot;
        if (tradeEquipmentStr.startsWith("Weapon:")) {
          equipmentToTrade = giver.weaponSlot;
          slot = "Weapon";
        } else if (tradeEquipmentStr.startsWith("Armor:")) {
          equipmentToTrade = giver.armorSlot;
          slot = "Armor";
        } else {
          equipmentToTrade = giver.accessorySlot;
          slot = "Accessory";
        }
        if (equipmentToTrade) {
          giver.unequip(slot);
          const replaced = receiver.equip(equipmentToTrade);
          if (replaced) {
            sector2.addToStash(replaced);
            tradeResult = `${giver.mercName} gave ${equipmentToTrade.equipmentName} to ${receiver.mercName}, ${replaced.equipmentName} added to stash`;
          } else {
            tradeResult = `${giver.mercName} gave ${equipmentToTrade.equipmentName} to ${receiver.mercName}`;
          }
          game.message(`Free trade: ${tradeResult}`);
        }
      }
    }
    explorationCache.delete(`${player.position}`);
    return {
      success: true,
      message: `Explored ${sector2.sectorName}`,
      data: { stashRemaining: sector2.stash.length, equipped, tradeResult }
    };
  });
}
function createTrainAction(game) {
  return Action.create("train").prompt("Train militia").condition((ctx) => {
    const player = ctx.player;
    const squad = player.primarySquad;
    if (!squad?.sectorId) return false;
    const sector2 = game.getSector(squad.sectorId);
    if (!sector2) return false;
    if (sector2.getTotalRebelMilitia() >= SectorConstants.MAX_MILITIA_PER_SIDE) return false;
    return player.team.some((m) => m.training > 0 && m.actionsRemaining >= ACTION_COSTS.TRAIN);
  }).chooseElement("merc", {
    prompt: "Select MERC to train militia",
    elementClass: MercCard,
    display: (merc) => capitalize(merc.mercName),
    filter: (element, ctx) => {
      const merc = element;
      const player = ctx.player;
      return player.team.includes(merc) && merc.training > 0 && merc.actionsRemaining >= ACTION_COSTS.TRAIN;
    }
  }).execute((args, ctx) => {
    const player = ctx.player;
    const merc = args.merc;
    const squad = player.primarySquad;
    const sector2 = game.getSector(squad.sectorId);
    if (!sector2) {
      return { success: false, message: "No sector found" };
    }
    useAction(merc, ACTION_COSTS.TRAIN);
    const trained = sector2.addRebelMilitia(`${player.position}`, merc.training);
    game.message(`${merc.mercName} trained ${trained} militia at ${sector2.sectorName}`);
    return { success: true, message: `Trained ${trained} militia` };
  });
}
function createReEquipAction(game) {
  return Action.create("reEquip").prompt("Re-equip").condition((ctx) => {
    const player = ctx.player;
    const squad = player.primarySquad;
    if (!squad?.sectorId) return false;
    if (!hasActionsRemaining(player, ACTION_COSTS.RE_EQUIP)) return false;
    const sector2 = game.getSector(squad.sectorId);
    return !!(sector2 && (sector2.stash.length > 0 || player.team.some(
      (m) => m.weaponSlot || m.armorSlot || m.accessorySlot
    )));
  }).chooseElement("merc", {
    prompt: "Select MERC to equip",
    elementClass: MercCard,
    display: (merc) => capitalize(merc.mercName),
    filter: (element, ctx) => {
      const merc = element;
      const player = ctx.player;
      return player.team.includes(merc) && merc.actionsRemaining >= ACTION_COSTS.RE_EQUIP;
    }
  }).chooseFrom("action", {
    prompt: "What do you want to do?",
    choices: (ctx) => {
      const player = ctx.player;
      const squad = player.primarySquad;
      const sector2 = game.getSector(squad.sectorId);
      const choices = [];
      if (sector2 && sector2.stash.length > 0) {
        choices.push("Take from stash");
      }
      const selectedMerc = ctx.args?.merc;
      const hasEquipment = selectedMerc && (selectedMerc.weaponSlot || selectedMerc.armorSlot || selectedMerc.accessorySlot);
      const hasTradeableTeammate = player.team.some(
        (m) => m !== selectedMerc && m.actionsRemaining >= ACTION_COSTS.RE_EQUIP
      );
      if (hasEquipment && hasTradeableTeammate) {
        choices.push("Trade with teammate (both spend action)");
      }
      choices.push("Unequip to stash");
      return choices;
    }
  }).chooseElement("tradePartner", {
    prompt: "Select teammate to trade with (will also spend their action)",
    elementClass: MercCard,
    display: (merc) => capitalize(merc.mercName),
    filter: (element, ctx) => {
      const merc = element;
      const player = ctx.player;
      const selectedMerc = ctx.args?.merc;
      return player.team.includes(merc) && merc !== selectedMerc && merc.actionsRemaining >= ACTION_COSTS.RE_EQUIP;
    },
    skipIf: (ctx) => !ctx.data?.action?.startsWith("Trade with teammate")
  }).chooseFrom("tradeEquipment", {
    prompt: "Which equipment to give?",
    choices: (ctx) => {
      const selectedMerc = ctx.args?.merc;
      const choices = [];
      if (selectedMerc?.weaponSlot) choices.push(`Weapon: ${selectedMerc.weaponSlot.equipmentName}`);
      if (selectedMerc?.armorSlot) choices.push(`Armor: ${selectedMerc.armorSlot.equipmentName}`);
      if (selectedMerc?.accessorySlot) choices.push(`Accessory: ${selectedMerc.accessorySlot.equipmentName}`);
      return choices;
    },
    skipIf: (ctx) => !ctx.data?.action?.startsWith("Trade with teammate")
  }).chooseFrom("stashEquipment", {
    prompt: "Select equipment from stash",
    choices: (ctx) => {
      const player = ctx.player;
      const squad = player.primarySquad;
      const sector2 = game.getSector(squad.sectorId);
      if (!sector2) return [];
      return sector2.stash.map((e, i) => `${i + 1}. ${e.equipmentName} (${e.equipmentType})`);
    },
    skipIf: (ctx) => ctx.data?.action !== "Take from stash"
  }).chooseFrom("unequipSlot", {
    prompt: "Which equipment slot to unequip?",
    choices: (ctx) => {
      const selectedMerc = ctx.args?.merc;
      const choices = [];
      if (selectedMerc?.weaponSlot) choices.push(`Weapon: ${selectedMerc.weaponSlot.equipmentName}`);
      if (selectedMerc?.armorSlot) choices.push(`Armor: ${selectedMerc.armorSlot.equipmentName}`);
      if (selectedMerc?.accessorySlot) choices.push(`Accessory: ${selectedMerc.accessorySlot.equipmentName}`);
      return choices;
    },
    skipIf: (ctx) => ctx.data?.action !== "Unequip to stash"
  }).execute((args, ctx) => {
    const player = ctx.player;
    const merc = args.merc;
    const action = args.action;
    const squad = player.primarySquad;
    const sector2 = game.getSector(squad.sectorId);
    if (!sector2) {
      return { success: false, message: "No sector found" };
    }
    useAction(merc, ACTION_COSTS.RE_EQUIP);
    if (action === "Take from stash" && sector2.stash.length > 0) {
      const stashChoice = args.stashEquipment;
      const stashIndex = stashChoice ? parseInt(stashChoice.split(".")[0], 10) - 1 : 0;
      const equipment = sector2.takeFromStash(stashIndex);
      if (equipment) {
        const replaced = merc.equip(equipment);
        if (replaced) {
          sector2.addToStash(replaced);
          game.message(`${merc.mercName} swapped ${replaced.equipmentName} for ${equipment.equipmentName}`);
        } else {
          game.message(`${merc.mercName} equipped ${equipment.equipmentName}`);
        }
        return { success: true, message: `Equipped ${equipment.equipmentName}` };
      }
    } else if (action?.startsWith("Trade with teammate")) {
      const tradePartner = args.tradePartner;
      const tradeEquipmentStr = args.tradeEquipment;
      if (tradePartner && tradeEquipmentStr) {
        useAction(tradePartner, ACTION_COSTS.RE_EQUIP);
        let equipmentToTrade;
        let slot;
        if (tradeEquipmentStr.startsWith("Weapon:")) {
          equipmentToTrade = merc.weaponSlot;
          slot = "Weapon";
        } else if (tradeEquipmentStr.startsWith("Armor:")) {
          equipmentToTrade = merc.armorSlot;
          slot = "Armor";
        } else {
          equipmentToTrade = merc.accessorySlot;
          slot = "Accessory";
        }
        if (equipmentToTrade) {
          merc.unequip(slot);
          const replaced = tradePartner.equip(equipmentToTrade);
          if (replaced) {
            sector2.addToStash(replaced);
            game.message(`${merc.mercName} traded ${equipmentToTrade.equipmentName} to ${tradePartner.mercName}, ${replaced.equipmentName} added to stash (both spent action)`);
          } else {
            game.message(`${merc.mercName} traded ${equipmentToTrade.equipmentName} to ${tradePartner.mercName} (both spent action)`);
          }
          return { success: true, message: `Traded ${equipmentToTrade.equipmentName}` };
        }
      }
    } else if (action === "Unequip to stash") {
      const unequipChoice = args.unequipSlot;
      let slot = "Weapon";
      if (unequipChoice?.startsWith("Armor:")) {
        slot = "Armor";
      } else if (unequipChoice?.startsWith("Accessory:")) {
        slot = "Accessory";
      }
      const unequipped = merc.unequip(slot);
      if (unequipped) {
        sector2.addToStash(unequipped);
        game.message(`${merc.mercName} unequipped ${unequipped.equipmentName}`);
        return { success: true, message: `Unequipped ${unequipped.equipmentName}` };
      }
    }
    return { success: false, message: "Nothing to do" };
  });
}
function createDocHealAction(game) {
  return Action.create("docHeal").prompt("Doc: Heal squad (free)").condition((ctx) => {
    const player = ctx.player;
    if (game.activeCombat) return false;
    const doc = player.team.find((m) => m.mercId === "doc" && !m.isDead);
    if (!doc) return false;
    const primaryMercs = player.primarySquad.getMercs();
    const secondaryMercs = player.secondarySquad.getMercs();
    let squadMates = [];
    if (primaryMercs.includes(doc)) {
      squadMates = primaryMercs.filter((m) => m !== doc && !m.isDead);
    } else if (secondaryMercs.includes(doc)) {
      squadMates = secondaryMercs.filter((m) => m !== doc && !m.isDead);
    }
    return squadMates.some((m) => m.damage > 0) || doc.damage > 0;
  }).execute((args, ctx) => {
    const player = ctx.player;
    const doc = player.team.find((m) => m.mercId === "doc" && !m.isDead);
    const primaryMercs = player.primarySquad.getMercs();
    const secondaryMercs = player.secondarySquad.getMercs();
    let squadMercs = [];
    if (primaryMercs.includes(doc)) {
      squadMercs = primaryMercs.filter((m) => !m.isDead);
    } else if (secondaryMercs.includes(doc)) {
      squadMercs = secondaryMercs.filter((m) => !m.isDead);
    }
    let healed = 0;
    for (const merc of squadMercs) {
      if (merc.damage > 0) {
        const healAmount = merc.damage;
        merc.fullHeal();
        game.message(`Doc healed ${merc.mercName} for ${healAmount} damage`);
        healed++;
      }
    }
    if (healed === 0) {
      return { success: false, message: "No one to heal" };
    }
    game.message(`Doc healed ${healed} MERC(s) in his squad`);
    return { success: true, message: `Healed ${healed} MERC(s)` };
  });
}
function createFeedbackDiscardAction(game) {
  return Action.create("feedbackDiscard").prompt("Feedback: Take from discard").condition((ctx) => {
    const player = ctx.player;
    const feedback = player.team.find((m) => m.mercId === "feedback" && !m.isDead);
    if (!feedback) return false;
    if (feedback.actionsRemaining < ACTION_COSTS.RE_EQUIP) return false;
    const weaponDiscard = game.getEquipmentDiscard("Weapon");
    const armorDiscard = game.getEquipmentDiscard("Armor");
    const accessoryDiscard = game.getEquipmentDiscard("Accessory");
    const hasWeapons = weaponDiscard && weaponDiscard.count(Equipment) > 0;
    const hasArmor2 = armorDiscard && armorDiscard.count(Equipment) > 0;
    const hasAccessories = accessoryDiscard && accessoryDiscard.count(Equipment) > 0;
    return hasWeapons || hasArmor2 || hasAccessories;
  }).chooseElement("equipment", {
    prompt: "Select equipment from discard pile",
    elementClass: Equipment,
    display: (eq) => `${eq.equipmentName} (${eq.equipmentType})`,
    filter: () => {
      return true;
    }
  }).execute((args, ctx) => {
    const player = ctx.player;
    const feedback = player.team.find((m) => m.mercId === "feedback" && !m.isDead);
    const selectedEquipment = args.equipment;
    if (!selectedEquipment) {
      return { success: false, message: "No equipment selected" };
    }
    const discard = game.getEquipmentDiscard(selectedEquipment.equipmentType);
    if (!discard) {
      return { success: false, message: "Discard pile not found" };
    }
    const replaced = feedback.equip(selectedEquipment);
    if (replaced) {
      const replaceDiscard = game.getEquipmentDiscard(replaced.equipmentType);
      if (replaceDiscard) replaced.putInto(replaceDiscard);
      game.message(`${feedback.mercName} swapped ${replaced.equipmentName} for ${selectedEquipment.equipmentName}`);
    } else {
      game.message(`${feedback.mercName} retrieved ${selectedEquipment.equipmentName} from discard`);
    }
    feedback.useAction(ACTION_COSTS.RE_EQUIP);
    return { success: true, message: `Retrieved ${selectedEquipment.equipmentName}` };
  });
}
function createSquidheadDisarmAction(game) {
  return Action.create("squidheadDisarm").prompt("Squidhead: Disarm mine").condition((ctx) => {
    const player = ctx.player;
    const squidhead = player.team.find((m) => m.mercId === "squidhead" && !m.isDead);
    if (!squidhead) return false;
    const squad = [player.primarySquad, player.secondarySquad].find(
      (s) => s.getMercs().includes(squidhead)
    );
    if (!squad?.sectorId) return false;
    const sector2 = game.getSector(squad.sectorId);
    if (!sector2) return false;
    const stash = sector2.getStashContents();
    return stash.some((e) => e.equipmentName.toLowerCase().includes("land mine"));
  }).execute((args, ctx) => {
    const player = ctx.player;
    const squidhead = player.team.find((m) => m.mercId === "squidhead" && !m.isDead);
    const squad = [player.primarySquad, player.secondarySquad].find(
      (s) => s.getMercs().includes(squidhead)
    );
    const sector2 = game.getSector(squad.sectorId);
    const stash = sector2.getStashContents();
    const mineIndex = stash.findIndex((e) => e.equipmentName.toLowerCase().includes("land mine"));
    if (mineIndex === -1) {
      return { success: false, message: "No land mines to disarm" };
    }
    const mine = sector2.takeFromStash(mineIndex);
    if (squidhead.canEquip(mine)) {
      const replaced = squidhead.equip(mine);
      if (replaced) {
        sector2.addToStash(replaced);
      }
      game.message(`${squidhead.mercName} disarms and collects the land mine`);
    } else {
      sector2.addToStash(mine);
      game.message(`${squidhead.mercName} disarms the land mine (left in stash)`);
    }
    return { success: true, message: "Disarmed land mine" };
  });
}
function createSquidheadArmAction(game) {
  return Action.create("squidheadArm").prompt("Squidhead: Arm mine").condition((ctx) => {
    const player = ctx.player;
    const squidhead = player.team.find((m) => m.mercId === "squidhead" && !m.isDead);
    if (!squidhead) return false;
    const hasLandMine = [squidhead.weaponSlot, squidhead.armorSlot, squidhead.accessorySlot].some(
      (slot) => slot && slot.equipmentName.toLowerCase().includes("land mine")
    );
    return hasLandMine;
  }).execute((args, ctx) => {
    const player = ctx.player;
    const squidhead = player.team.find((m) => m.mercId === "squidhead" && !m.isDead);
    const squad = [player.primarySquad, player.secondarySquad].find(
      (s) => s.getMercs().includes(squidhead)
    );
    if (!squad?.sectorId) {
      return { success: false, message: "Squidhead must be on the board" };
    }
    const sector2 = game.getSector(squad.sectorId);
    if (!sector2) {
      return { success: false, message: "Sector not found" };
    }
    let mine;
    if (squidhead.accessorySlot?.equipmentName.toLowerCase().includes("land mine")) {
      mine = squidhead.unequip("Accessory");
    } else if (squidhead.weaponSlot?.equipmentName.toLowerCase().includes("land mine")) {
      mine = squidhead.unequip("Weapon");
    } else if (squidhead.armorSlot?.equipmentName.toLowerCase().includes("land mine")) {
      mine = squidhead.unequip("Armor");
    }
    if (!mine) {
      return { success: false, message: "No land mine to arm" };
    }
    sector2.addToStash(mine);
    game.message(`${squidhead.mercName} arms a land mine at ${sector2.sectorName}`);
    return { success: true, message: "Armed land mine" };
  });
}
function createHagnessDrawAction(game) {
  return Action.create("hagnessDraw").prompt("Hagness: Draw equipment for squad").condition((ctx) => {
    const player = ctx.player;
    const hagness = player.team.find((m) => m.mercId === "hagness" && !m.isDead);
    if (!hagness) return false;
    return hagness.actionsRemaining >= 1;
  }).chooseElement("recipient", {
    prompt: "Give equipment to which squad member?",
    elementClass: MercCard,
    display: (merc) => capitalize(merc.mercName),
    filter: (element, ctx) => {
      const merc = element;
      const player = ctx.player;
      const hagness = player.team.find((m) => m.mercId === "hagness" && !m.isDead);
      if (!hagness) return false;
      const primaryMercs = player.primarySquad.getMercs();
      const secondaryMercs = player.secondarySquad.getMercs();
      let squadMates = [];
      if (primaryMercs.includes(hagness)) {
        squadMates = primaryMercs.filter((m) => !m.isDead);
      } else if (secondaryMercs.includes(hagness)) {
        squadMates = secondaryMercs.filter((m) => !m.isDead);
      }
      return squadMates.includes(merc);
    }
  }).execute((args, ctx) => {
    const player = ctx.player;
    const hagness = player.team.find((m) => m.mercId === "hagness" && !m.isDead);
    const recipient = args.recipient;
    if (!recipient) {
      return { success: false, message: "Selection cancelled" };
    }
    const drawnEquipment = [];
    const types = ["Weapon", "Armor", "Accessory"];
    for (const type of types) {
      const eq = game.drawEquipment(type);
      if (eq) drawnEquipment.push(eq);
    }
    if (drawnEquipment.length === 0) {
      return { success: false, message: "No equipment available" };
    }
    let bestEquip = null;
    for (const eq of drawnEquipment) {
      if (recipient.canEquip(eq)) {
        const current = recipient.getEquipmentOfType(eq.equipmentType);
        if (!current || (eq.serial || 0) > (current.serial || 0)) {
          bestEquip = eq;
          break;
        }
      }
    }
    if (!bestEquip) {
      bestEquip = drawnEquipment.find((eq) => recipient.canEquip(eq)) || drawnEquipment[0];
    }
    const replaced = recipient.equip(bestEquip);
    for (const eq of drawnEquipment) {
      if (eq !== bestEquip) {
        const discard = game.getEquipmentDiscard(eq.equipmentType);
        if (discard) eq.putInto(discard);
      }
    }
    if (replaced) {
      const discard = game.getEquipmentDiscard(replaced.equipmentType);
      if (discard) replaced.putInto(discard);
    }
    hagness.useAction(1);
    game.message(`Hagness gives ${bestEquip.equipmentName} to ${recipient.mercName}`);
    return { success: true, message: `Gave ${bestEquip.equipmentName} to ${recipient.mercName}` };
  });
}
function createHospitalAction(game) {
  return Action.create("hospital").prompt("Visit hospital").condition((ctx) => {
    const player = ctx.player;
    const squad = player.primarySquad;
    if (!squad?.sectorId) return false;
    const sector2 = game.getSector(squad.sectorId);
    if (!sector2?.hasHospital) return false;
    return player.team.some((m) => m.damage > 0 && m.actionsRemaining >= ACTION_COSTS.HOSPITAL);
  }).chooseElement("merc", {
    prompt: "Select MERC to heal",
    elementClass: MercCard,
    display: (merc) => capitalize(merc.mercName),
    filter: (element, ctx) => {
      const merc = element;
      const player = ctx.player;
      return player.team.includes(merc) && merc.damage > 0 && merc.actionsRemaining >= ACTION_COSTS.HOSPITAL;
    }
  }).execute((args, ctx) => {
    const player = ctx.player;
    const merc = args.merc;
    useAction(merc, ACTION_COSTS.HOSPITAL);
    const healedAmount = merc.damage;
    merc.fullHeal();
    game.message(`${merc.mercName} was fully healed at the hospital (restored ${healedAmount} health)`);
    return { success: true, message: `Healed ${merc.mercName}` };
  });
}
function createArmsDealerAction(game) {
  const drawnEquipmentCache = /* @__PURE__ */ new Map();
  return Action.create("armsDealer").prompt("Visit arms dealer").condition((ctx) => {
    const player = ctx.player;
    const squad = player.primarySquad;
    if (!squad?.sectorId) return false;
    const sector2 = game.getSector(squad.sectorId);
    if (!sector2?.hasArmsDealer) return false;
    return hasActionsRemaining(player, ACTION_COSTS.ARMS_DEALER);
  }).chooseElement("actingMerc", {
    prompt: "Which MERC visits the dealer?",
    elementClass: MercCard,
    display: (merc) => capitalize(merc.mercName),
    filter: (element, ctx) => {
      const merc = element;
      const player = ctx.player;
      return player.team.includes(merc) && merc.actionsRemaining >= ACTION_COSTS.ARMS_DEALER;
    }
  }).chooseFrom("equipmentType", {
    prompt: "What type of equipment?",
    choices: () => ["Weapon", "Armor", "Accessory"]
  }).chooseFrom("equipMerc", {
    prompt: "Free Re-Equip: Which MERC should equip this item? (or skip)",
    choices: (ctx) => {
      const player = ctx.player;
      const equipmentType = ctx.data?.equipmentType;
      const cacheKey = `${player.position}`;
      if (!drawnEquipmentCache.has(cacheKey)) {
        const equipment = game.drawEquipment(equipmentType);
        if (equipment) {
          drawnEquipmentCache.set(cacheKey, equipment);
          game.message(`Drew ${equipment.equipmentName} from ${equipmentType} deck`);
        }
      }
      const choices = player.team.map((m) => ({
        label: `${m.mercName}`,
        value: m.mercName
      }));
      choices.push({ label: "Skip (add to stash)", value: "skip" });
      return choices;
    }
  }).execute((args, ctx) => {
    const player = ctx.player;
    const actingMerc = args.actingMerc;
    const cacheKey = `${player.position}`;
    const squad = player.primarySquad;
    const sector2 = game.getSector(squad.sectorId);
    useAction(actingMerc, ACTION_COSTS.ARMS_DEALER);
    const equipment = drawnEquipmentCache.get(cacheKey);
    drawnEquipmentCache.delete(cacheKey);
    if (equipment && sector2) {
      const equipMercName = args.equipMerc;
      if (equipMercName && equipMercName !== "skip") {
        const targetMerc = player.team.find((m) => m.mercName === equipMercName);
        if (targetMerc) {
          const replaced = targetMerc.equip(equipment);
          if (replaced) {
            sector2.addToStash(replaced);
            game.message(`${targetMerc.mercName} equipped ${equipment.equipmentName}, ${replaced.equipmentName} added to stash`);
          } else {
            game.message(`${targetMerc.mercName} equipped ${equipment.equipmentName}`);
          }
          return { success: true, message: `Bought and equipped ${equipment.equipmentName}` };
        }
      }
      sector2.addToStash(equipment);
      game.message(`${actingMerc.mercName} bought ${equipment.equipmentName} (added to stash)`);
      return { success: true, message: `Bought ${equipment.equipmentName}` };
    }
    return { success: false, message: "No equipment available" };
  });
}
function createSplitSquadAction(game) {
  return Action.create("splitSquad").prompt("Split squad").condition((ctx) => {
    const player = ctx.player;
    return player.primarySquad.mercCount > 1 && player.secondarySquad.mercCount === 0;
  }).chooseElement("merc", {
    prompt: "Select MERC to split off into secondary squad",
    elementClass: MercCard,
    display: (merc) => capitalize(merc.mercName),
    filter: (element, ctx) => {
      const merc = element;
      const player = ctx.player;
      return player.primarySquad.getMercs().includes(merc);
    }
  }).execute((args, ctx) => {
    const player = ctx.player;
    const merc = args.merc;
    merc.putInto(player.secondarySquad);
    player.secondarySquad.sectorId = player.primarySquad.sectorId;
    game.message(`${player.name} split off ${merc.mercName} into secondary squad`);
    return { success: true, message: `Split ${merc.mercName} to secondary squad` };
  });
}
function createMergeSquadsAction(game) {
  return Action.create("mergeSquads").prompt("Merge squads").condition((ctx) => {
    const player = ctx.player;
    return player.secondarySquad.mercCount > 0 && player.primarySquad.sectorId === player.secondarySquad.sectorId;
  }).execute((args, ctx) => {
    const player = ctx.player;
    const mercs = player.secondarySquad.getMercs();
    for (const merc of mercs) {
      merc.putInto(player.primarySquad);
    }
    player.secondarySquad.sectorId = void 0;
    game.message(`${player.name} merged squads (${mercs.length} MERC(s) rejoined)`);
    return { success: true, message: `Merged ${mercs.length} MERC(s)` };
  });
}
function createFireMercAction(game) {
  return Action.create("fireMerc").prompt("Fire a MERC").condition((ctx) => {
    const player = ctx.player;
    return player.teamSize >= 2;
  }).chooseElement("merc", {
    prompt: "Select MERC to fire",
    elementClass: MercCard,
    display: (merc) => capitalize(merc.mercName),
    filter: (element, ctx) => {
      const merc = element;
      const player = ctx.player;
      return player.team.includes(merc);
    }
  }).execute((args, ctx) => {
    const player = ctx.player;
    const merc = args.merc;
    const squad = player.primarySquad.getMercs().includes(merc) ? player.primarySquad : player.secondarySquad;
    const sector2 = squad?.sectorId ? game.getSector(squad.sectorId) : null;
    const droppedEquipment = [];
    if (merc.weaponSlot) {
      const weapon = merc.unequip("Weapon");
      if (weapon && sector2) {
        sector2.addToStash(weapon);
        droppedEquipment.push(weapon.equipmentName);
      }
    }
    if (merc.armorSlot) {
      const armor = merc.unequip("Armor");
      if (armor && sector2) {
        sector2.addToStash(armor);
        droppedEquipment.push(armor.equipmentName);
      }
    }
    if (merc.accessorySlot) {
      const accessory = merc.unequip("Accessory");
      if (accessory && sector2) {
        sector2.addToStash(accessory);
        droppedEquipment.push(accessory.equipmentName);
      }
    }
    merc.putInto(game.mercDiscard);
    if (droppedEquipment.length > 0) {
      game.message(`${player.name} fired ${merc.mercName}, dropped ${droppedEquipment.join(", ")} to stash`);
    } else {
      game.message(`${player.name} fired ${merc.mercName}`);
    }
    return { success: true, message: `Fired ${merc.mercName}`, data: { droppedEquipment } };
  });
}
function createEndTurnAction(game) {
  return Action.create("endTurn").prompt("End turn").condition((ctx) => {
    const player = ctx.player;
    return player.team.some((m) => m.actionsRemaining > 0);
  }).chooseFrom("confirm", {
    prompt: "End your turn?",
    choices: ["Yes, end turn"]
  }).execute((args, ctx) => {
    const player = ctx.player;
    for (const merc of player.team) {
      merc.actionsRemaining = 0;
    }
    game.message(`${player.name} ends their turn`);
    return { success: true, message: "Turn ended", data: { endTurn: true } };
  });
}
function createHireStartingMercsAction(game) {
  const drawnMercsCache = /* @__PURE__ */ new Map();
  return Action.create("hireStartingMercs").prompt("Hire your starting MERCs").condition((ctx) => {
    const player = ctx.player;
    return player.teamSize === 0;
  }).chooseFrom("firstMerc", {
    prompt: "Select your FIRST MERC to hire",
    choices: (ctx) => {
      const player = ctx.player;
      const playerId = `${player.position}`;
      if (!drawnMercsCache.has(playerId)) {
        drawnMercsCache.set(playerId, drawMercsForHiring(game, 3));
      }
      const available = drawnMercsCache.get(playerId) || [];
      if (available.length === 0) {
        return ["No MERCs available"];
      }
      return available.map((m) => capitalize(m.mercName));
    }
  }).chooseFrom("secondMerc", {
    prompt: "Select your SECOND MERC to hire",
    choices: (ctx) => {
      const player = ctx.player;
      const playerId = `${player.position}`;
      const available = drawnMercsCache.get(playerId) || [];
      if (available.length === 0) {
        return ["No MERCs available"];
      }
      return available.map((m) => capitalize(m.mercName));
    }
  }).execute((args, ctx) => {
    const player = ctx.player;
    const playerId = `${player.position}`;
    const available = drawnMercsCache.get(playerId) || [];
    if (available.length === 0) {
      return { success: false, message: "No MERCs available in deck" };
    }
    const firstName = args.firstMerc;
    const secondName = args.secondMerc;
    if (!firstName || !secondName || firstName === "No MERCs available" || secondName === "No MERCs available") {
      return { success: false, message: "No MERCs available in deck" };
    }
    if (firstName === secondName) {
      return { success: false, message: "Please select two different MERCs" };
    }
    const firstMerc = available.find((m) => capitalize(m.mercName) === firstName);
    const secondMerc = available.find((m) => capitalize(m.mercName) === secondName);
    if (!firstMerc || !secondMerc) {
      return { success: false, message: "Invalid selection" };
    }
    firstMerc.putInto(player.primarySquad);
    secondMerc.putInto(player.primarySquad);
    game.message(`${player.name} hired ${firstMerc.mercName} and ${secondMerc.mercName}`);
    for (const merc of available) {
      if (merc !== firstMerc && merc !== secondMerc) {
        merc.putInto(game.mercDiscard);
        game.message(`${merc.mercName} was not selected and returns to the deck`);
      }
    }
    drawnMercsCache.delete(playerId);
    return {
      success: true,
      message: `Hired ${firstMerc.mercName} and ${secondMerc.mercName}`,
      data: { hiredMercs: [firstMerc.mercName, secondMerc.mercName] }
    };
  });
}
function createEquipStartingAction(game) {
  return Action.create("equipStarting").prompt("Equip starting equipment").condition((ctx) => {
    const player = ctx.player;
    return player.team.some(
      (merc) => !merc.weaponSlot && !merc.armorSlot && !merc.accessorySlot
    );
  }).chooseElement("merc", {
    prompt: "Select MERC to equip",
    elementClass: MercCard,
    display: (merc) => capitalize(merc.mercName),
    filter: (element, ctx) => {
      const merc = element;
      const player = ctx.player;
      return player.team.includes(merc) && !merc.weaponSlot && !merc.armorSlot && !merc.accessorySlot;
    }
  }).chooseFrom("equipmentType", {
    prompt: "Choose equipment type to draw",
    choices: () => ["Weapon", "Armor", "Accessory"]
  }).execute((args, ctx) => {
    const merc = args.merc;
    const equipmentType = args.equipmentType;
    const equipment = equipStartingEquipment(game, merc, equipmentType);
    if (equipment) {
      return {
        success: true,
        message: `${merc.mercName} equipped ${equipment.equipmentName}`
      };
    }
    return {
      success: false,
      message: `No ${equipmentType.toLowerCase()} available`
    };
  });
}
function createPlaceLandingAction(game) {
  return Action.create("placeLanding").prompt("Choose your landing zone").chooseElement("sector", {
    prompt: "Select an edge sector to land",
    elementClass: Sector,
    filter: (element) => {
      const sector2 = element;
      return isValidLandingSector(game, sector2);
    },
    boardRef: (element) => ({ id: element.id })
  }).execute((args, ctx) => {
    const player = ctx.player;
    const sector2 = args.sector;
    player.primarySquad.sectorId = sector2.sectorId;
    game.message(`${player.name} landed at ${sector2.sectorName}`);
    return { success: true, message: `Landed at ${sector2.sectorName}` };
  });
}
function createPlaceLandingDay1Action(game) {
  return createPlaceLandingAction(game);
}
function createPlayTacticsAction(game) {
  return Action.create("playTactics").prompt("Play a tactics card").condition((ctx) => {
    if (!game.isDictatorPlayer(ctx.player)) return false;
    if (game.dictatorPlayer?.isAI) {
      return (game.dictatorPlayer?.tacticsDeck?.count(TacticsCard) ?? 0) > 0;
    }
    return (game.dictatorPlayer?.tacticsHand?.count(TacticsCard) ?? 0) > 0;
  }).chooseElement("card", {
    prompt: "Select a tactics card to play",
    elementClass: TacticsCard,
    filter: (element) => {
      const card = element;
      if (game.dictatorPlayer?.isAI) {
        const topCard = game.dictatorPlayer?.tacticsDeck?.first(TacticsCard);
        return card === topCard;
      }
      return game.dictatorPlayer?.tacticsHand?.all(TacticsCard).includes(card) ?? false;
    },
    // MERC-pj8: Explicit AI auto-select for top deck card
    aiSelect: () => {
      if (!game.dictatorPlayer?.isAI) return void 0;
      return game.dictatorPlayer?.tacticsDeck?.first(TacticsCard) ?? void 0;
    }
  }).execute((args) => {
    const card = args.card;
    game.message(`Dictator plays: ${card.tacticsName}`);
    card.putInto(game.dictatorPlayer.tacticsDiscard);
    const result = executeTacticsEffect(game, card);
    return {
      success: result.success,
      message: `Played ${card.tacticsName}: ${result.message}`,
      data: result.data
    };
  });
}
function createReinforceAction(game) {
  return Action.create("reinforce").prompt("Reinforce militia").condition((ctx) => {
    if (!game.isDictatorPlayer(ctx.player)) return false;
    if (game.dictatorPlayer?.isAI) {
      return (game.dictatorPlayer?.tacticsDeck?.count(TacticsCard) ?? 0) > 0;
    }
    return (game.dictatorPlayer?.tacticsHand?.count(TacticsCard) ?? 0) > 0;
  }).chooseElement("card", {
    prompt: "Discard a tactics card to reinforce",
    elementClass: TacticsCard,
    filter: (element) => {
      const card = element;
      if (game.dictatorPlayer?.isAI) {
        const topCard = game.dictatorPlayer?.tacticsDeck?.first(TacticsCard);
        return card === topCard;
      }
      return game.dictatorPlayer?.tacticsHand?.all(TacticsCard).includes(card) ?? false;
    },
    // MERC-pj8: Explicit AI auto-select for top deck card
    aiSelect: () => {
      if (!game.dictatorPlayer?.isAI) return void 0;
      return game.dictatorPlayer?.tacticsDeck?.first(TacticsCard) ?? void 0;
    }
  }).chooseElement("sector", {
    prompt: "Place reinforcement militia where?",
    elementClass: Sector,
    filter: (element) => {
      const sector2 = element;
      const isControlled = sector2.dictatorMilitia >= sector2.getTotalRebelMilitia() && sector2.dictatorMilitia > 0;
      const isBase = game.dictatorPlayer.baseSectorId === sector2.sectorId;
      return isControlled || isBase;
    },
    boardRef: (element) => ({ id: element.id }),
    // MERC-0m0: AI auto-select per rule 4.4.3 - closest to rebel-controlled sector
    aiSelect: () => {
      if (!game.dictatorPlayer?.isAI) return void 0;
      const controlled = game.gameMap.getAllSectors().filter((s) => {
        const isControlled = s.dictatorMilitia >= s.getTotalRebelMilitia() && s.dictatorMilitia > 0;
        const isBase = game.dictatorPlayer.baseSectorId === s.sectorId;
        return isControlled || isBase;
      });
      if (controlled.length === 0) return void 0;
      return selectMilitiaPlacementSector(game, controlled, "dictator") ?? void 0;
    }
  }).execute((args) => {
    const card = args.card;
    const sector2 = args.sector;
    const reinforcements2 = game.getReinforcementAmount();
    card.putInto(game.dictatorPlayer.tacticsDiscard);
    const placed = sector2.addDictatorMilitia(reinforcements2);
    game.message(`Dictator discards ${card.tacticsName} to reinforce`);
    game.message(`Placed ${placed} militia at ${sector2.sectorName}`);
    return { success: true, message: `Reinforced with ${placed} militia` };
  });
}
function hasBeneficialMilitiaMove(game) {
  const sectorsWithMilitia = game.gameMap.getAllSectors().filter((s) => s.dictatorMilitia > 0);
  for (const from of sectorsWithMilitia) {
    const fromDist = distanceToNearestRebel(game, from);
    const adjacent = game.getAdjacentSectors(from);
    for (const to of adjacent) {
      const toDist = distanceToNearestRebel(game, to);
      if (toDist < fromDist && to.dictatorMilitia < 10) {
        return true;
      }
    }
  }
  return false;
}
function createMoveMilitiaAction(game) {
  return Action.create("moveMilitia").prompt("Move militia").condition((ctx) => {
    if (!game.isDictatorPlayer(ctx.player)) return false;
    if (!game.gameMap.getAllSectors().some((s) => s.dictatorMilitia > 0)) return false;
    if (game.dictatorPlayer?.isAI) {
      return hasBeneficialMilitiaMove(game);
    }
    return true;
  }).chooseElement("fromSector", {
    prompt: "Move militia from which sector?",
    elementClass: Sector,
    filter: (element) => {
      const sector2 = element;
      return sector2.dictatorMilitia > 0;
    },
    boardRef: (element) => ({ id: element.id }),
    // MERC-p3c: AI selects sector furthest from rebels to move militia from
    aiSelect: () => {
      if (!game.dictatorPlayer?.isAI) return void 0;
      const sectorsWithMilitia = game.gameMap.getAllSectors().filter((s) => s.dictatorMilitia > 0);
      if (sectorsWithMilitia.length === 0) return void 0;
      const sorted = [...sectorsWithMilitia].sort((a, b) => {
        const distA = distanceToNearestRebel(game, a);
        const distB = distanceToNearestRebel(game, b);
        return distB - distA;
      });
      return sorted[0];
    }
  }).chooseElement("toSector", {
    prompt: "Move militia to which adjacent sector?",
    elementClass: Sector,
    filter: (element, ctx) => {
      const sector2 = element;
      const fromSector = ctx.args.fromSector;
      if (!fromSector) return false;
      const adjacent = game.getAdjacentSectors(fromSector);
      return adjacent.some((s) => s.sectorId === sector2.sectorId) && sector2.dictatorMilitia < SectorConstants.MAX_MILITIA_PER_SIDE;
    },
    boardRef: (element) => ({ id: element.id }),
    // MERC-p3c: AI selects adjacent sector closest to rebels (per rule 4.4.3)
    aiSelect: (ctx) => {
      if (!game.dictatorPlayer?.isAI) return void 0;
      const fromSector = ctx.args.fromSector;
      if (!fromSector) return void 0;
      const adjacent = game.getAdjacentSectors(fromSector).filter((s) => s.dictatorMilitia < SectorConstants.MAX_MILITIA_PER_SIDE);
      if (adjacent.length === 0) return void 0;
      const sorted = [...adjacent].sort((a, b) => {
        const distA = distanceToNearestRebel(game, a);
        const distB = distanceToNearestRebel(game, b);
        return distA - distB;
      });
      return sorted[0];
    }
  }).chooseFrom("count", {
    prompt: "How many militia to move?",
    choices: (ctx) => {
      const fromSector = ctx.args.fromSector;
      if (!fromSector) return ["1"];
      return Array.from({ length: fromSector.dictatorMilitia }, (_, i) => String(i + 1));
    },
    // MERC-p3c: AI moves maximum possible militia
    aiSelect: (ctx) => {
      if (!game.dictatorPlayer?.isAI) return void 0;
      const fromSector = ctx.args.fromSector;
      if (!fromSector) return void 0;
      return String(fromSector.dictatorMilitia);
    }
  }).execute((args) => {
    const fromSector = args.fromSector;
    const toSector = args.toSector;
    const count = parseInt(args.count, 10);
    const removed = fromSector.removeDictatorMilitia(count);
    const added = toSector.addDictatorMilitia(removed);
    game.message(`Dictator moved ${added} militia from ${fromSector.sectorName} to ${toSector.sectorName}`);
    for (const rebel of game.rebelPlayers) {
      const hasSquad = rebel.primarySquad.sectorId === toSector.sectorId || rebel.secondarySquad.sectorId === toSector.sectorId;
      const hasMilitia = toSector.getRebelMilitia(`${rebel.position}`) > 0;
      if (hasSquad || hasMilitia) {
        game.message(`Rebels detected at ${toSector.sectorName} - combat begins!`);
        const outcome = executeCombat(game, toSector, rebel);
        return {
          success: true,
          message: `Moved ${added} militia and engaged in combat`,
          data: {
            combatTriggered: true,
            rebelVictory: outcome.rebelVictory,
            dictatorVictory: outcome.dictatorVictory
          }
        };
      }
    }
    return { success: true, message: `Moved ${added} militia` };
  });
}
function createSkipMilitiaMoveAction(game) {
  return Action.create("skipMilitiaMove").prompt("Skip militia movement").condition((ctx) => {
    return game.isDictatorPlayer(ctx.player);
  }).execute(() => {
    game.message("Dictator holds position");
    return { success: true, message: "Militia held" };
  });
}
function getDictatorUnitName(unit) {
  if (unit instanceof DictatorCard) {
    return unit.dictatorName;
  }
  return unit.mercName;
}
function canDictatorUnitMove(unit) {
  return unit.actionsRemaining >= ACTION_COSTS.MOVE && !!unit.sectorId;
}
function createDictatorMoveAction(game) {
  return Action.create("dictatorMove").prompt("Move Dictator unit").condition((ctx) => {
    if (!game.isDictatorPlayer(ctx.player)) return false;
    const mercs = game.dictatorPlayer?.hiredMercs || [];
    const dictator = game.dictatorPlayer?.dictator;
    const mercCanMove = mercs.some((m) => canDictatorUnitMove(m));
    const dictatorCanMove = dictator?.inPlay && canDictatorUnitMove(dictator);
    return mercCanMove || dictatorCanMove;
  }).chooseElement("merc", {
    prompt: "Select unit to move",
    display: (unit) => capitalize(getDictatorUnitName(unit)),
    filter: (element) => {
      if (element instanceof MercCard) {
        const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
        return dictatorMercs.includes(element) && canDictatorUnitMove(element);
      }
      if (element instanceof DictatorCard) {
        if (!element.inPlay) return false;
        if (element !== game.dictatorPlayer?.dictator) return false;
        return canDictatorUnitMove(element);
      }
      return false;
    },
    // MERC-5aa: AI auto-selection
    aiSelect: () => {
      if (!game.dictatorPlayer?.isAI) return void 0;
      const nextAction = getNextAIAction(game);
      if (nextAction?.actionName === "dictatorMove" && nextAction.unit) {
        return nextAction.unit;
      }
      return void 0;
    }
  }).chooseElement("destination", {
    prompt: "Select destination sector",
    elementClass: Sector,
    filter: (element, ctx) => {
      const sector2 = element;
      const unit = ctx.args.merc;
      if (!unit?.sectorId) return false;
      const currentSector = game.getSector(unit.sectorId);
      if (!currentSector) return false;
      const adjacent = game.getAdjacentSectors(currentSector);
      return adjacent.some((s) => s.sectorId === sector2.sectorId);
    },
    // MERC-5aa: AI auto-selection
    aiSelect: (ctx) => {
      if (!game.dictatorPlayer?.isAI) return void 0;
      const unit = ctx.args.merc;
      if (!unit) return void 0;
      const nextAction = getNextAIAction(game);
      if (nextAction?.destination) {
        return nextAction.destination;
      }
      return getAIMoveDestination(game, unit) ?? void 0;
    }
  }).execute((args) => {
    const unit = args.merc;
    const destination = args.destination;
    unit.useAction(ACTION_COSTS.MOVE);
    unit.sectorId = destination.sectorId;
    game.message(`${getDictatorUnitName(unit)} moved to ${destination.sectorName}`);
    for (const rebel of game.rebelPlayers) {
      const hasSquad = rebel.primarySquad.sectorId === destination.sectorId || rebel.secondarySquad.sectorId === destination.sectorId;
      const hasMilitia = destination.getRebelMilitia(`${rebel.position}`) > 0;
      if (hasSquad || hasMilitia) {
        game.message(`Rebels detected at ${destination.sectorName} - combat begins!`);
        const outcome = executeCombat(game, destination, rebel);
        return {
          success: true,
          message: `Moved to ${destination.sectorName} and engaged in combat`,
          data: {
            combatTriggered: true,
            rebelVictory: outcome.rebelVictory,
            dictatorVictory: outcome.dictatorVictory
          }
        };
      }
    }
    return { success: true, message: `Moved to ${destination.sectorName}` };
  });
}
function canDictatorUnitExplore(unit, game) {
  if (unit.actionsRemaining < ACTION_COSTS.EXPLORE || !unit.sectorId) return false;
  const sector2 = game.getSector(unit.sectorId);
  return sector2 !== void 0 && !sector2.explored;
}
function createDictatorExploreAction(game) {
  return Action.create("dictatorExplore").prompt("Explore with Dictator unit").condition((ctx) => {
    if (!game.isDictatorPlayer(ctx.player)) return false;
    const mercs = game.dictatorPlayer?.hiredMercs || [];
    const dictator = game.dictatorPlayer?.dictator;
    const mercCanExplore = mercs.some((m) => canDictatorUnitExplore(m, game));
    const dictatorCanExplore = dictator?.inPlay && canDictatorUnitExplore(dictator, game);
    return mercCanExplore || dictatorCanExplore;
  }).chooseElement("merc", {
    prompt: "Select unit to explore",
    display: (unit) => capitalize(getDictatorUnitName(unit)),
    filter: (element) => {
      if (element instanceof MercCard) {
        const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
        if (!dictatorMercs.includes(element)) return false;
        return canDictatorUnitExplore(element, game);
      }
      if (element instanceof DictatorCard) {
        if (!element.inPlay) return false;
        if (element !== game.dictatorPlayer?.dictator) return false;
        return canDictatorUnitExplore(element, game);
      }
      return false;
    },
    // MERC-5aa: AI auto-selection
    aiSelect: () => {
      if (!game.dictatorPlayer?.isAI) return void 0;
      const nextAction = getNextAIAction(game);
      if (nextAction?.actionName === "dictatorExplore" && nextAction.unit) {
        return nextAction.unit;
      }
      return void 0;
    }
  }).execute((args) => {
    const unit = args.merc;
    const sector2 = game.getSector(unit.sectorId);
    if (!sector2 || sector2.explored) {
      return { success: false, message: "Cannot explore" };
    }
    unit.useAction(ACTION_COSTS.EXPLORE);
    sector2.explore();
    const drawnEquipment = [];
    for (let i = 0; i < sector2.weaponLoot; i++) {
      const weapon = game.drawEquipment("Weapon");
      if (weapon) {
        sector2.addToStash(weapon);
        drawnEquipment.push(weapon);
      }
    }
    for (let i = 0; i < sector2.armorLoot; i++) {
      const armor = game.drawEquipment("Armor");
      if (armor) {
        sector2.addToStash(armor);
        drawnEquipment.push(armor);
      }
    }
    for (let i = 0; i < sector2.accessoryLoot; i++) {
      const accessory = game.drawEquipment("Accessory");
      if (accessory) {
        sector2.addToStash(accessory);
        drawnEquipment.push(accessory);
      }
    }
    game.message(`${getDictatorUnitName(unit)} explored ${sector2.sectorName}, found ${drawnEquipment.length} equipment`);
    if (drawnEquipment.length > 0) {
      const equipped = autoEquipDictatorUnits(game, sector2);
      if (equipped > 0) {
        game.message(`Dictator auto-equipped ${equipped} item(s)`);
      }
    }
    return { success: true, message: `Explored ${sector2.sectorName}` };
  });
}
function canDictatorUnitTrain(unit, game) {
  if (unit.training <= 0 || unit.actionsRemaining < ACTION_COSTS.TRAIN || !unit.sectorId) return false;
  const sector2 = game.getSector(unit.sectorId);
  return sector2 !== void 0 && sector2.dictatorMilitia < SectorConstants.MAX_MILITIA_PER_SIDE;
}
function createDictatorTrainAction(game) {
  return Action.create("dictatorTrain").prompt("Train militia with Dictator unit").condition((ctx) => {
    if (!game.isDictatorPlayer(ctx.player)) return false;
    const mercs = game.dictatorPlayer?.hiredMercs || [];
    const dictator = game.dictatorPlayer?.dictator;
    const mercCanTrain = mercs.some((m) => canDictatorUnitTrain(m, game));
    const dictatorCanTrain = dictator?.inPlay && canDictatorUnitTrain(dictator, game);
    return mercCanTrain || dictatorCanTrain;
  }).chooseElement("merc", {
    prompt: "Select unit to train",
    display: (unit) => capitalize(getDictatorUnitName(unit)),
    filter: (element) => {
      if (element instanceof MercCard) {
        const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
        if (!dictatorMercs.includes(element)) return false;
        return canDictatorUnitTrain(element, game);
      }
      if (element instanceof DictatorCard) {
        if (!element.inPlay) return false;
        if (element !== game.dictatorPlayer?.dictator) return false;
        return canDictatorUnitTrain(element, game);
      }
      return false;
    },
    // MERC-5aa: AI auto-selection
    aiSelect: () => {
      if (!game.dictatorPlayer?.isAI) return void 0;
      const nextAction = getNextAIAction(game);
      if (nextAction?.actionName === "dictatorTrain" && nextAction.unit) {
        return nextAction.unit;
      }
      return void 0;
    }
  }).execute((args) => {
    const unit = args.merc;
    const sector2 = game.getSector(unit.sectorId);
    if (!sector2) {
      return { success: false, message: "No sector found" };
    }
    unit.useAction(ACTION_COSTS.TRAIN);
    const trained = sector2.addDictatorMilitia(unit.training);
    game.message(`${getDictatorUnitName(unit)} trained ${trained} militia at ${sector2.sectorName}`);
    return { success: true, message: `Trained ${trained} militia` };
  });
}
function canDictatorUnitReEquip(unit, game) {
  if (unit.actionsRemaining < ACTION_COSTS.RE_EQUIP || !unit.sectorId) return false;
  const sector2 = game.getSector(unit.sectorId);
  return sector2 !== void 0 && sector2.stash.length > 0;
}
function createDictatorReEquipAction(game) {
  return Action.create("dictatorReEquip").prompt("Re-equip Dictator unit").condition((ctx) => {
    if (!game.isDictatorPlayer(ctx.player)) return false;
    const mercs = game.dictatorPlayer?.hiredMercs || [];
    const dictator = game.dictatorPlayer?.dictator;
    const mercCanReEquip = mercs.some((m) => canDictatorUnitReEquip(m, game));
    const dictatorCanReEquip = dictator?.inPlay && canDictatorUnitReEquip(dictator, game);
    return mercCanReEquip || dictatorCanReEquip;
  }).chooseElement("merc", {
    prompt: "Select unit to re-equip",
    display: (unit) => capitalize(getDictatorUnitName(unit)),
    filter: (element) => {
      if (element instanceof MercCard) {
        const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
        if (!dictatorMercs.includes(element)) return false;
        return canDictatorUnitReEquip(element, game);
      }
      if (element instanceof DictatorCard) {
        if (!element.inPlay) return false;
        if (element !== game.dictatorPlayer?.dictator) return false;
        return canDictatorUnitReEquip(element, game);
      }
      return false;
    },
    // MERC-5aa: AI auto-selection
    aiSelect: () => {
      if (!game.dictatorPlayer?.isAI) return void 0;
      const nextAction = getNextAIAction(game);
      if (nextAction?.actionName === "dictatorReEquip" && nextAction.unit) {
        return nextAction.unit;
      }
      return void 0;
    }
  }).chooseElement("equipment", {
    prompt: "Select equipment from stash",
    elementClass: Equipment,
    filter: (element, ctx) => {
      const equipment = element;
      const unit = ctx.args.merc;
      if (!unit?.sectorId) return false;
      const sector2 = game.getSector(unit.sectorId);
      return sector2?.stash.includes(equipment) ?? false;
    },
    // MERC-5aa: AI auto-selection
    aiSelect: (ctx) => {
      if (!game.dictatorPlayer?.isAI) return void 0;
      const unit = ctx.args.merc;
      if (!unit) return void 0;
      return getAIEquipmentSelection(game, unit) ?? void 0;
    }
  }).execute((args) => {
    const unit = args.merc;
    const equipment = args.equipment;
    const sector2 = game.getSector(unit.sectorId);
    if (!sector2) {
      return { success: false, message: "No sector found" };
    }
    unit.useAction(ACTION_COSTS.RE_EQUIP);
    const currentEquipment = unit.getEquipmentOfType(equipment.equipmentType);
    if (currentEquipment) {
      unit.unequip(equipment.equipmentType);
      sector2.addToStash(currentEquipment);
    }
    const stashIdx = sector2.stash.indexOf(equipment);
    if (stashIdx >= 0) {
      sector2.takeFromStash(stashIdx);
    }
    unit.equip(equipment);
    game.message(`${getDictatorUnitName(unit)} equipped ${equipment.equipmentName}`);
    return { success: true, message: `Equipped ${equipment.equipmentName}` };
  });
}
function hasHealingItem(merc) {
  const accessory = merc.accessorySlot;
  if (!accessory) return false;
  const name = accessory.equipmentName.toLowerCase();
  return name.includes("medical kit") || name.includes("first aid kit");
}
function getHealingAmount(itemName) {
  const name = itemName.toLowerCase();
  if (name.includes("medical kit")) return 3;
  if (name.includes("first aid kit")) return 1;
  return 0;
}
function createDictatorHealAction(game) {
  return Action.create("dictatorHeal").prompt("Heal injured MERC").condition((ctx) => {
    if (!game.isDictatorPlayer(ctx.player)) return false;
    const mercs = game.dictatorPlayer?.hiredMercs || [];
    const hasHealer = mercs.some((m) => !m.isDead && hasHealingItem(m));
    if (!hasHealer) return false;
    const hasDamaged = mercs.some((m) => mercNeedsHealing(m));
    return hasDamaged;
  }).chooseElement("healer", {
    prompt: "Select MERC with healing item",
    display: (merc) => `${merc.mercName} (${merc.accessorySlot?.equipmentName})`,
    filter: (element) => {
      if (!(element instanceof MercCard)) return false;
      const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
      if (!dictatorMercs.includes(element)) return false;
      return !element.isDead && hasHealingItem(element);
    },
    // MERC-7fy: AI auto-selection based on healing priority
    aiSelect: () => {
      if (!game.dictatorPlayer?.isAI) return void 0;
      const mercs = game.dictatorPlayer.hiredMercs.filter((m) => !m.isDead);
      const damagedMercs = mercs.filter((m) => mercNeedsHealing(m));
      const healingAction = getAIHealingPriority(game, damagedMercs, mercs);
      if (healingAction?.type === "item" && healingAction.merc) {
        return healingAction.merc;
      }
      return mercs.find((m) => hasHealingItem(m));
    }
  }).chooseElement("target", {
    prompt: "Select MERC to heal",
    display: (merc) => `${merc.mercName} (${merc.health}/${merc.maxHealth} HP)`,
    filter: (element) => {
      if (!(element instanceof MercCard)) return false;
      const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
      if (!dictatorMercs.includes(element)) return false;
      return mercNeedsHealing(element);
    },
    // MERC-7fy: AI auto-selection - heal lowest health MERC
    aiSelect: () => {
      if (!game.dictatorPlayer?.isAI) return void 0;
      const mercs = game.dictatorPlayer.hiredMercs.filter((m) => !m.isDead);
      const damagedMercs = mercs.filter((m) => mercNeedsHealing(m));
      const healingAction = getAIHealingPriority(game, damagedMercs, mercs);
      if (healingAction?.target) {
        return healingAction.target;
      }
      return damagedMercs.sort((a, b) => a.health - b.health)[0];
    }
  }).execute((args) => {
    const healer = args.healer;
    const target = args.target;
    const healingItem = healer.accessorySlot;
    if (!healingItem) {
      return { success: false, message: "No healing item equipped" };
    }
    const healAmount = getHealingAmount(healingItem.equipmentName);
    const actualHealed = Math.min(healAmount, target.damage);
    target.heal(actualHealed);
    healer.unequip("Accessory");
    const discard = game.getEquipmentDiscard("Accessory");
    if (discard) {
      healingItem.putInto(discard);
    }
    game.message(`${healer.mercName} uses ${healingItem.equipmentName} to heal ${target.mercName} for ${actualHealed} HP`);
    return { success: true, message: `Healed ${target.mercName} for ${actualHealed} HP` };
  });
}
function createDictatorEndMercActionsAction(game) {
  return Action.create("dictatorEndMercActions").prompt("End MERC actions").condition((ctx) => {
    return game.isDictatorPlayer(ctx.player);
  }).execute(() => {
    const mercs = game.dictatorPlayer?.hiredMercs || [];
    for (const merc of mercs) {
      merc.actionsRemaining = 0;
    }
    if (game.dictatorPlayer?.dictator?.inPlay) {
      game.dictatorPlayer.dictator.actionsRemaining = 0;
    }
    game.message("Dictator ends MERC actions");
    return { success: true, message: "MERC actions ended" };
  });
}
function canDictatorUnitFireMortar(unit, game) {
  if (unit.actionsRemaining < 1 || !unit.sectorId) return false;
  if (!hasMortar(unit)) return false;
  const sector2 = game.getSector(unit.sectorId);
  if (!sector2) return false;
  const targets = getMortarTargets(game, sector2);
  return targets.length > 0;
}
function createDictatorMortarAction(game) {
  return Action.create("dictatorMortar").prompt("Fire mortar at adjacent sector").condition((ctx) => {
    if (!game.isDictatorPlayer(ctx.player)) return false;
    const mercs = game.dictatorPlayer?.hiredMercs || [];
    const dictator = game.dictatorPlayer?.dictator;
    const mercCanFire = mercs.some((m) => canDictatorUnitFireMortar(m, game));
    const dictatorCanFire = dictator?.inPlay && canDictatorUnitFireMortar(dictator, game);
    return mercCanFire || dictatorCanFire;
  }).chooseElement("merc", {
    prompt: "Select unit to fire mortar",
    display: (unit) => capitalize(getDictatorUnitName(unit)),
    filter: (element) => {
      if (element instanceof MercCard) {
        const dictatorMercs = game.dictatorPlayer?.hiredMercs || [];
        return dictatorMercs.includes(element) && canDictatorUnitFireMortar(element, game);
      }
      if (element instanceof DictatorCard) {
        if (!element.inPlay) return false;
        if (element !== game.dictatorPlayer?.dictator) return false;
        return canDictatorUnitFireMortar(element, game);
      }
      return false;
    },
    // MERC-9m9: AI auto-selection - pick first unit with mortar
    aiSelect: () => {
      if (!game.dictatorPlayer?.isAI) return void 0;
      const mercs = game.dictatorPlayer.hiredMercs.filter((m) => canDictatorUnitFireMortar(m, game));
      if (mercs.length > 0) return mercs[0];
      const dictator = game.dictatorPlayer.dictator;
      if (dictator?.inPlay && canDictatorUnitFireMortar(dictator, game)) {
        return dictator;
      }
      return void 0;
    }
  }).chooseElement("target", {
    prompt: "Select target sector",
    elementClass: Sector,
    filter: (element, ctx) => {
      const sector2 = element;
      const unit = ctx.args.merc;
      if (!unit?.sectorId) return false;
      const fromSector = game.getSector(unit.sectorId);
      if (!fromSector) return false;
      const validTargets = getMortarTargets(game, fromSector);
      return validTargets.some((t) => t.sectorId === sector2.sectorId);
    },
    // MERC-9m9: AI auto-selection - pick sector with most targets
    aiSelect: (ctx) => {
      if (!game.dictatorPlayer?.isAI) return void 0;
      const unit = ctx.args.merc;
      if (!unit?.sectorId) return void 0;
      const fromSector = game.getSector(unit.sectorId);
      if (!fromSector) return void 0;
      return selectMortarTarget(game, fromSector) ?? void 0;
    }
  }).execute((args) => {
    const unit = args.merc;
    const targetSector = args.target;
    unit.useAction(1);
    const mortarDamage = 1;
    game.message(`${getDictatorUnitName(unit)} fires mortar at ${targetSector.sectorName}!`);
    let totalDamage = 0;
    for (const rebel of game.rebelPlayers) {
      const mercsInSector = game.getMercsInSector(targetSector, rebel);
      for (const merc of mercsInSector) {
        merc.takeDamage(mortarDamage);
        totalDamage++;
        game.message(`Mortar deals ${mortarDamage} damage to ${merc.mercName}`);
      }
    }
    for (const rebel of game.rebelPlayers) {
      const militia = targetSector.getRebelMilitia(`${rebel.position}`);
      if (militia > 0) {
        targetSector.removeRebelMilitia(`${rebel.position}`, mortarDamage);
        totalDamage++;
        game.message(`Mortar kills ${mortarDamage} of ${rebel.name}'s militia`);
      }
    }
    return {
      success: true,
      message: `Mortar attack dealt ${totalDamage} damage`,
      data: { totalDamage }
    };
  });
}
function createCombatContinueAction(game) {
  return Action.create("combatContinue").prompt("Continue fighting").condition(() => game.activeCombat !== null).execute((_, ctx) => {
    if (!game.activeCombat) {
      return { success: false, message: "No active combat" };
    }
    const sector2 = game.getSector(game.activeCombat.sectorId);
    if (!sector2) {
      return { success: false, message: "Combat sector not found" };
    }
    const player = ctx.player;
    const outcome = executeCombat(game, sector2, player);
    return {
      success: true,
      message: outcome.combatPending ? "Combat continues - choose to retreat or continue" : outcome.rebelVictory ? "Victory!" : "Combat complete",
      data: {
        rebelVictory: outcome.rebelVictory,
        dictatorVictory: outcome.dictatorVictory,
        combatPending: outcome.combatPending
      }
    };
  });
}
function createCombatRetreatAction(game) {
  return Action.create("combatRetreat").prompt("Retreat from combat").condition(() => game.activeCombat !== null).chooseElement("retreatSector", {
    prompt: "Choose sector to retreat to",
    elementClass: Sector,
    filter: (element) => {
      if (!game.activeCombat) return false;
      const sector2 = element;
      const combatSector = game.getSector(game.activeCombat.sectorId);
      if (!combatSector) return false;
      const player = game.rebelPlayers.find(
        (p) => `${p.position}` === game.activeCombat.attackingPlayerId
      );
      if (!player) return false;
      const validSectors = getValidRetreatSectors(game, combatSector, player);
      return validSectors.some((s) => s.sectorId === sector2.sectorId);
    },
    boardRef: (element) => ({ id: element.id })
  }).execute((args) => {
    const retreatSector = args.retreatSector;
    const outcome = executeCombatRetreat(game, retreatSector);
    return {
      success: true,
      message: `Retreated to ${retreatSector.sectorName}`,
      data: {
        retreated: true,
        retreatSector: retreatSector.sectorName
      }
    };
  });
}
function registerAllActions(game) {
  game.registerAction(createHireMercAction(game));
  game.registerAction(createPlaceLandingAction(game));
  game.registerAction(createMoveAction(game));
  game.registerAction(createCoordinatedAttackAction(game));
  game.registerAction(createDeclareCoordinatedAttackAction(game));
  game.registerAction(createJoinCoordinatedAttackAction(game));
  game.registerAction(createExecuteCoordinatedAttackAction(game));
  game.registerAction(createExploreAction(game));
  game.registerAction(createTrainAction(game));
  game.registerAction(createReEquipAction(game));
  game.registerAction(createDocHealAction(game));
  game.registerAction(createFeedbackDiscardAction(game));
  game.registerAction(createSquidheadDisarmAction(game));
  game.registerAction(createSquidheadArmAction(game));
  game.registerAction(createHagnessDrawAction(game));
  game.registerAction(createHospitalAction(game));
  game.registerAction(createArmsDealerAction(game));
  game.registerAction(createSplitSquadAction(game));
  game.registerAction(createMergeSquadsAction(game));
  game.registerAction(createFireMercAction(game));
  game.registerAction(createEndTurnAction(game));
  game.registerAction(createCombatContinueAction(game));
  game.registerAction(createCombatRetreatAction(game));
  game.registerAction(createHireStartingMercsAction(game));
  game.registerAction(createEquipStartingAction(game));
  game.registerAction(createPlayTacticsAction(game));
  game.registerAction(createReinforceAction(game));
  game.registerAction(createMoveMilitiaAction(game));
  game.registerAction(createSkipMilitiaMoveAction(game));
  game.registerAction(createDictatorMoveAction(game));
  game.registerAction(createDictatorExploreAction(game));
  game.registerAction(createDictatorTrainAction(game));
  game.registerAction(createDictatorReEquipAction(game));
  game.registerAction(createDictatorHealAction(game));
  game.registerAction(createDictatorMortarAction(game));
  game.registerAction(createDictatorEndMercActionsAction(game));
  game.registerAction(createDesignatePrivacyPlayerAction(game));
}
function createDesignatePrivacyPlayerAction(game) {
  return Action.create("designatePrivacyPlayer").prompt("Designate Privacy Player").condition(() => {
    return game.dictatorPlayer?.isAI && !game.dictatorPlayer.privacyPlayerId;
  }).chooseElement("player", {
    prompt: "Choose which player will handle AI decisions",
    filter: (element) => {
      return game.rebelPlayers.includes(element);
    },
    display: (player) => player.name
  }).execute((args) => {
    const player = args.player;
    setPrivacyPlayer(game, `${player.position}`);
    return {
      success: true,
      message: `${player.name} designated as Privacy Player`
    };
  });
}

// src/rules/game.ts
init_constants();

// src/rules/setup.ts
init_elements();
init_constants();
function isCorner(row, col, rows, cols) {
  return (row === 0 || row === rows - 1) && (col === 0 || col === cols - 1);
}
function isCenter(row, col, rows, cols) {
  if (rows % 2 === 0 || cols % 2 === 0) return false;
  const centerRow = Math.floor(rows / 2);
  const centerCol = Math.floor(cols / 2);
  return row === centerRow && col === centerCol;
}
function isIndustryPosition(row, col, rows, cols) {
  if (rows !== void 0 && cols !== void 0) {
    if (isCenter(row, col, rows, cols)) {
      return false;
    }
  }
  return (row + col) % 2 === 0;
}
function shuffleArray(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function selectRandom(array, count) {
  const shuffled = shuffleArray(array);
  return shuffled.slice(0, count);
}
function buildMap(game, sectorData) {
  const config = game.setupConfig;
  if (!config) {
    throw new Error("Setup configuration not loaded");
  }
  const [cols, rows] = config.mapSize;
  game.gameMap.rows = rows;
  game.gameMap.cols = cols;
  game.gameMap.updateLabels();
  const industries = sectorData.filter((s) => s.type === "Industry");
  const cities = sectorData.filter((s) => s.type === "City");
  const wilderness = sectorData.filter((s) => s.type === "Wilderness");
  const selectedIndustries = selectRandom(industries, config.sectorTypes.industries);
  const selectedCities = selectRandom(cities, config.sectorTypes.cities);
  const selectedWilderness = selectRandom(wilderness, config.sectorTypes.wilderness);
  const cornerPositions = [];
  const centerPosition = rows % 2 === 1 && cols % 2 === 1 ? { row: Math.floor(rows / 2), col: Math.floor(cols / 2) } : null;
  const industryPositions = [];
  const nonIndustryPositions = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const pos = { row, col };
      if (isCorner(row, col, rows, cols)) {
        cornerPositions.push(pos);
      } else if (centerPosition && row === centerPosition.row && col === centerPosition.col) {
      } else if (isIndustryPosition(row, col, rows, cols)) {
        industryPositions.push(pos);
      } else {
        nonIndustryPositions.push(pos);
      }
    }
  }
  const shuffledIndustryPositions = shuffleArray(industryPositions);
  const allIndustryPositions = [...cornerPositions, ...shuffledIndustryPositions];
  const shuffledNonIndustryPositions = shuffleArray(nonIndustryPositions);
  let industryIndex = 0;
  let cityIndex = 0;
  let wildernessIndex = 0;
  const positionMap = /* @__PURE__ */ new Map();
  for (let i = 0; i < allIndustryPositions.length && industryIndex < selectedIndustries.length; i++) {
    const pos = allIndustryPositions[i];
    positionMap.set(`${pos.row},${pos.col}`, selectedIndustries[industryIndex++]);
  }
  if (centerPosition && cityIndex < selectedCities.length) {
    positionMap.set(`${centerPosition.row},${centerPosition.col}`, selectedCities[cityIndex++]);
  }
  for (let i = 0; i < shuffledNonIndustryPositions.length && cityIndex < selectedCities.length; i++) {
    const pos = shuffledNonIndustryPositions[i];
    if (!positionMap.has(`${pos.row},${pos.col}`)) {
      positionMap.set(`${pos.row},${pos.col}`, selectedCities[cityIndex++]);
    }
  }
  for (const pos of shuffledNonIndustryPositions) {
    if (!positionMap.has(`${pos.row},${pos.col}`) && wildernessIndex < selectedWilderness.length) {
      positionMap.set(`${pos.row},${pos.col}`, selectedWilderness[wildernessIndex++]);
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const sectorInfo = positionMap.get(`${row},${col}`);
      if (!sectorInfo) {
        throw new Error(`No sector assigned to position (${row}, ${col})`);
      }
      game.gameMap.create(Sector, sectorInfo.name, {
        row,
        col,
        sectorId: sectorInfo.id,
        sectorName: sectorInfo.name,
        sectorType: sectorInfo.type,
        value: sectorInfo.value,
        image: sectorInfo.image,
        weaponLoot: sectorInfo.weapons,
        armorLoot: sectorInfo.armor,
        accessoryLoot: sectorInfo.accessories,
        explored: false,
        dictatorMilitia: 0,
        isBase: false
      });
    }
  }
  game.message(`Map built: ${cols}x${rows} grid with ${cols * rows} sectors`);
}
function setupDictator(game, dictatorData, dictatorId) {
  let selectedDictator;
  if (dictatorId) {
    const found = dictatorData.find((d) => d.id === dictatorId);
    if (!found) {
      throw new Error(`Dictator not found: ${dictatorId}`);
    }
    selectedDictator = found;
  } else {
    const randomIndex = Math.floor(Math.random() * dictatorData.length);
    selectedDictator = dictatorData[randomIndex];
  }
  const dictatorCard = game.create(DictatorCard, `dictator-${selectedDictator.id}`, {
    dictatorId: selectedDictator.id,
    dictatorName: selectedDictator.name,
    ability: selectedDictator.ability,
    bio: selectedDictator.bio,
    image: selectedDictator.image,
    baseInitiative: selectedDictator.initiative,
    baseTraining: selectedDictator.training,
    baseCombat: selectedDictator.combat,
    damage: 0,
    inPlay: false
  });
  game.dictatorPlayer.dictator = dictatorCard;
  game.message(`Dictator selected: ${selectedDictator.name}`);
  return dictatorCard;
}
function setupTacticsDeck(game, tacticsData, activeTacticsCount = DictatorConstants.ACTIVE_TACTICS_CARDS) {
  const tacticsDeck = game.create(TacticsDeck, "tactics-deck");
  tacticsDeck.setOrder("stacking");
  tacticsDeck.contentsHidden();
  const tacticsHand = game.create(TacticsHand, "tactics-hand");
  const tacticsDiscard = game.create(DiscardPile, "tactics-discard");
  game.dictatorPlayer.tacticsDeck = tacticsDeck;
  game.dictatorPlayer.tacticsHand = tacticsHand;
  game.dictatorPlayer.tacticsDiscard = tacticsDiscard;
  const allTacticsCards = [];
  for (const tactics of tacticsData) {
    for (let i = 0; i < tactics.quantity; i++) {
      allTacticsCards.push(tactics);
    }
  }
  const selectedTactics = selectRandom(allTacticsCards, activeTacticsCount);
  for (let i = 0; i < selectedTactics.length; i++) {
    const tactics = selectedTactics[i];
    tacticsDeck.create(TacticsCard, `tactics-${tactics.id}-${i}`, {
      tacticsId: tactics.id,
      tacticsName: tactics.name,
      story: tactics.story,
      description: tactics.description
    });
  }
  tacticsDeck.shuffle();
  game.message(`Tactics deck prepared with ${activeTacticsCount} cards`);
}
function shuffleDecks(game) {
  if (game.mercDeck.count() > 0) {
    game.mercDeck.shuffle();
    game.message(`MERC deck shuffled (${game.mercDeck.count()} cards)`);
  }
  if (game.weaponsDeck.count() > 0) {
    game.weaponsDeck.shuffle();
    game.message(`Weapons deck shuffled (${game.weaponsDeck.count()} cards)`);
  }
  if (game.armorDeck.count() > 0) {
    game.armorDeck.shuffle();
    game.message(`Armor deck shuffled (${game.armorDeck.count()} cards)`);
  }
  if (game.accessoriesDeck.count() > 0) {
    game.accessoriesDeck.shuffle();
    game.message(`Accessories deck shuffled (${game.accessoriesDeck.count()} cards)`);
  }
}
function performSetup(game, options) {
  game.message("=== Beginning Game Setup ===");
  buildMap(game, options.sectorData);
  setupDictator(game, options.dictatorData, options.dictatorId);
  setupTacticsDeck(game, options.tacticsData, options.activeTacticsCount);
  shuffleDecks(game);
  game.currentDay = 0;
  game.message("=== Setup Complete ===");
  game.message("Map: All sectors unexplored");
  game.message(`Dictator: ${game.dictatorPlayer.dictator.dictatorName} selected`);
  game.message(`Tactics: ${game.dictatorPlayer.tacticsDeck.count(TacticsCard)} cards in deck`);
  game.message("Equipment: 3 decks ready");
  game.message("MERCs: Deck ready");
  game.message("Pawns: Not yet on map");
  game.message("Militia: Not yet placed");
  game.message("");
  game.message("Proceed to Day 1: The Landing");
}
function validateSetupConfig(sectorData, config) {
  const errors = [];
  const industries = sectorData.filter((s) => s.type === "Industry");
  const cities = sectorData.filter((s) => s.type === "City");
  const wilderness = sectorData.filter((s) => s.type === "Wilderness");
  if (industries.length < config.industries) {
    errors.push(`Not enough industries: need ${config.industries}, have ${industries.length}`);
  }
  if (cities.length < config.cities) {
    errors.push(`Not enough cities: need ${config.cities}, have ${cities.length}`);
  }
  if (wilderness.length < config.wilderness) {
    errors.push(`Not enough wilderness: need ${config.wilderness}, have ${wilderness.length}`);
  }
  return {
    valid: errors.length === 0,
    errors
  };
}
function getSetupSummary(game) {
  const lines = [];
  lines.push("=== Setup Summary ===");
  lines.push(`Rebel Players: ${game.rebelPlayers.length}`);
  lines.push(`Map Size: ${game.gameMap.cols}x${game.gameMap.rows}`);
  lines.push(`Total Sectors: ${game.gameMap.getAllSectors().length}`);
  const sectors = game.gameMap.getAllSectors();
  const industries = sectors.filter((s) => s.isIndustry);
  const cities = sectors.filter((s) => s.isCity);
  const wilderness = sectors.filter((s) => s.isWilderness);
  lines.push(`  Industries: ${industries.length}`);
  lines.push(`  Cities: ${cities.length}`);
  lines.push(`  Wilderness: ${wilderness.length}`);
  if (game.dictatorPlayer?.dictator) {
    lines.push(`Dictator: ${game.dictatorPlayer.dictator.dictatorName}`);
  }
  if (game.dictatorPlayer?.tacticsDeck) {
    lines.push(`Tactics Deck: ${game.dictatorPlayer.tacticsDeck.count(TacticsCard)} cards`);
  }
  lines.push(`MERC Deck: ${game.mercDeck.count()} cards`);
  lines.push(`Weapons Deck: ${game.weaponsDeck.count()} cards`);
  lines.push(`Armor Deck: ${game.armorDeck.count()} cards`);
  lines.push(`Accessories Deck: ${game.accessoriesDeck.count()} cards`);
  return lines.join("\n");
}

// data/mercs.json
var mercs_default = [
  {
    id: "apeiron",
    name: "apeiron",
    quantity: 1,
    training: 2,
    combat: 2,
    initiative: 1,
    ability: "Won't use grenades or mortars.",
    bio: "His brother died in an explosion.",
    image: "/mercs/apeiron.jpg"
  },
  {
    id: "badger",
    name: "badger",
    quantity: 1,
    training: 1,
    combat: 3,
    initiative: 1,
    ability: "Always has initiative over militia.",
    bio: "Was a wrestler for Wisconsin.",
    image: "/mercs/badger.jpg"
  },
  {
    id: "basic",
    name: "basic",
    quantity: 1,
    training: 1,
    combat: 2,
    initiative: 2,
    ability: "May reroll all dice once per combat.",
    bio: "Repeated basic training 4 times.",
    image: "/mercs/basic.jpg"
  },
  {
    id: "borris",
    name: "borris",
    quantity: 1,
    training: 1,
    combat: 2,
    initiative: 2,
    ability: "Will not work with Squirrel.",
    bio: "Often requests assignments with Natasha.",
    image: "/mercs/borris.jpg"
  },
  {
    id: "bouba",
    name: "bouba",
    quantity: 1,
    training: 0,
    combat: 1,
    initiative: 4,
    ability: "+1 combat when using a handgun.",
    bio: "Wants desperately to be a good MERC.",
    image: "/mercs/bouba.jpg"
  },
  {
    id: "buzzkill",
    name: "buzzkill",
    quantity: 1,
    training: 1,
    combat: 2,
    initiative: 2,
    ability: "Always attacks enemy MERCs instead of militia when possible.",
    bio: "Killed his cellmate for using an electric razor.",
    image: "/mercs/buzzkill.jpg"
  },
  {
    id: "doc",
    name: "doc",
    quantity: 1,
    training: 2,
    combat: 1,
    initiative: 2,
    ability: "Heals all MERCs in his squad as a free action outside of combat.",
    bio: "Put pressure here.",
    image: "/mercs/doc.jpg"
  },
  {
    id: "ewok",
    name: "ewok",
    quantity: 1,
    training: 1,
    combat: 2,
    initiative: 2,
    sex: "F",
    ability: "+1 action.",
    bio: "She often spouts Star Wars trivia.",
    image: "/mercs/ewok.jpg"
  },
  {
    id: "faustina",
    name: "faustina",
    quantity: 1,
    training: 3,
    combat: 2,
    initiative: 3,
    sex: "F",
    ability: "+1 action, for training only.",
    bio: "Attitude goes further than fortitude.",
    image: "/mercs/faustina.jpg"
  },
  {
    id: "feedback",
    name: "feedback",
    quantity: 1,
    training: 2,
    combat: 2,
    initiative: 1,
    ability: "Spend 1 action to take 1 piece of equipment from the discard pile.",
    bio: "If it sparks, I can fix it.",
    image: "/mercs/feedback.jpg"
  },
  {
    id: "genesis",
    name: "genesis",
    quantity: 1,
    training: 2,
    combat: 2,
    initiative: 2,
    ability: "May carry an extra weapon in his accessory slot instead of an accessory.",
    bio: "Jack of all trades.",
    image: "/mercs/genesis.jpg"
  },
  {
    id: "gunther",
    name: "gunther",
    quantity: 1,
    training: 2,
    combat: 2,
    initiative: 1,
    ability: "He can use all equipment slots to carry accessories.",
    bio: "There's no problem that's too big.",
    image: "/mercs/gunther.jpg"
  },
  {
    id: "haarg",
    name: "haarg",
    quantity: 1,
    training: 1,
    combat: 3,
    initiative: 1,
    ability: "+1 to any skill that anyone in his squad has higher than him.",
    bio: "It's been done before, but I can do it better.",
    image: "/mercs/haarg.jpg"
  },
  {
    id: "juicer",
    name: "juicer",
    quantity: 1,
    training: 1,
    combat: 2,
    initiative: 2,
    ability: "+2 health.",
    bio: "Don't hire if you do drug screening.",
    image: "/mercs/juicer.jpg"
  },
  {
    id: "kastern",
    name: "kastern",
    quantity: 1,
    training: 3,
    combat: 2,
    initiative: 0,
    ability: "Always goes first in combat.",
    bio: "Likes to sing nursery rhymes while in combat.",
    image: "/mercs/kastern.jpg"
  },
  {
    id: "khenn",
    name: "khenn",
    quantity: 1,
    training: 3,
    combat: 2,
    initiative: 0,
    ability: "Rolls a D6 at the beginning of combat. That is his initiative for this combat.",
    bio: "He's a cheap bastard.",
    image: "/mercs/khenn.jpg"
  },
  {
    id: "lucid",
    name: "lucid",
    quantity: 1,
    training: 2,
    combat: 2,
    initiative: 2,
    ability: "Hits on a 3+.",
    bio: "Hates it when people call him a contractor.",
    image: "/mercs/lucid.jpg"
  },
  {
    id: "max",
    name: "max",
    quantity: 1,
    training: 4,
    combat: 2,
    initiative: 2,
    ability: "Opposing MERCs have -1 to all skills when attacking his squad.",
    bio: "After 25 years of service, founded MERC.",
    image: "/mercs/max.jpg"
  },
  {
    id: "mayhem",
    name: "mayhem",
    quantity: 1,
    training: 1,
    combat: 2,
    initiative: 2,
    ability: "+2 combat when using an Uzi.",
    bio: "Became a MERC because his neighborhood was too violent.",
    image: "/mercs/mayhem.jpg"
  },
  {
    id: "meatbop",
    name: "meatbop",
    quantity: 1,
    training: 3,
    combat: 2,
    initiative: 0,
    ability: "Will not fight without an accessory equipped.",
    bio: "Has a habit of 'misplacing' his gun.",
    image: "/mercs/meatbop.jpg"
  },
  {
    id: "moose",
    name: "moose",
    quantity: 1,
    training: 1,
    combat: 2,
    initiative: 2,
    ability: "Will not work with Borris.",
    bio: "Grew up on the same street as Squirrel.",
    image: "/mercs/moose.jpg"
  },
  {
    id: "natasha",
    name: "natasha",
    quantity: 1,
    training: 2,
    combat: 3,
    initiative: 3,
    sex: "F",
    ability: "Will not work with Moose.",
    bio: "Kinda has a thing for Squirrel.",
    image: "/mercs/natasha.jpg"
  },
  {
    id: "preaction",
    name: "preaction",
    quantity: 1,
    training: 0,
    combat: 2,
    initiative: 5,
    ability: "Automatically restores 1 health each day until fully healed.",
    bio: "Prefers to work at night.",
    image: "/mercs/preaction.jpg"
  },
  {
    id: "ra",
    name: "ra",
    quantity: 1,
    training: 2,
    combat: 2,
    initiative: 1,
    ability: "+1 target with any weapon.",
    bio: "Always brings the beer.",
    image: "/mercs/ra.jpg"
  },
  {
    id: "rizen",
    name: "rizen",
    quantity: 1,
    training: 3,
    combat: 2,
    initiative: 3,
    ability: "Regardless of weapon used, each hit counts as a new target when attacking militia.",
    bio: "F\\*\\*\\* the f\\*\\*\\*ing f\\*\\*\\*ers!",
    image: "/mercs/rizen.jpg"
  },
  {
    id: "rozeske",
    name: "rozeske",
    quantity: 1,
    training: 2,
    combat: 2,
    initiative: 1,
    ability: "+1 combat while wearing armor.",
    bio: "He's a MERC because he likes to travel.",
    image: "/mercs/rozeske.jpg"
  },
  {
    id: "runde",
    name: "runde",
    quantity: 1,
    training: 3,
    combat: 2,
    initiative: 2,
    ability: "Is always the last MERC targeted.",
    bio: "This grainy photo is the only known image of him.",
    image: "/mercs/runde.jpg"
  },
  {
    id: "sarge",
    name: "sarge",
    quantity: 1,
    training: 2,
    combat: 1,
    initiative: 3,
    ability: "+1 to all skills when his initiative is highest in the squad.",
    bio: "OohRah!",
    image: "/mercs/sarge.jpg"
  },
  {
    id: "shadkaam",
    name: "shadkaam",
    quantity: 1,
    training: 1,
    combat: 3,
    initiative: 2,
    ability: "Immune to attack dogs.",
    bio: "With me you will be triumphant.",
    image: "/mercs/shadkaam.jpg"
  },
  {
    id: "shooter",
    name: "shooter",
    quantity: 1,
    training: 0,
    combat: 6,
    initiative: 1,
    ability: "Is an extremely good shot.",
    bio: "Volunteered for two tours in a hot zone.",
    image: "/mercs/shooter.jpg"
  },
  {
    id: "snake",
    name: "snake",
    quantity: 1,
    training: 0,
    combat: 3,
    initiative: 2,
    ability: "+1 to all skills when working alone.",
    bio: "Named himself after his hero Snake Pliskin.",
    image: "/mercs/snake.jpg"
  },
  {
    id: "sonia",
    name: "sonia",
    quantity: 1,
    training: 4,
    combat: 2,
    initiative: 4,
    sex: "F",
    ability: "She can bring up to 2 militia with her when she moves.",
    bio: "She's also an Olympic gymnastics champion.",
    image: "/mercs/sonia.jpg"
  },
  {
    id: "squidhead",
    name: "squidhead",
    quantity: 1,
    training: 2,
    combat: 2,
    initiative: 1,
    ability: "Disarms enemy land mines when he enters a sector. May re-arm them for himself.",
    bio: "Live hard.",
    image: "/mercs/squidhead.jpg"
  },
  {
    id: "squirrel",
    name: "squirrel",
    quantity: 1,
    training: 2,
    combat: 2,
    initiative: 3,
    ability: "Will not work with Natasha.",
    bio: "Thinks Borris has a weirdly shaped head.",
    image: "/mercs/squirrel.jpg"
  },
  {
    id: "stumpy",
    name: "stumpy",
    quantity: 1,
    training: 0,
    combat: 2,
    initiative: 3,
    ability: "+1 combat with grenades and mortars.",
    bio: "Wants to follow in his grandfather's footsteps.",
    image: "/mercs/stumpy.jpg"
  },
  {
    id: "surgeon",
    name: "surgeon",
    quantity: 1,
    training: 3,
    combat: 3,
    initiative: 2,
    ability: "May discard 1 combat die before he fires to restore 1 health to anyone in his squad.",
    bio: "Got a medical discharge for injuring his foot in Iraq.",
    image: "/mercs/surgeon.jpg"
  },
  {
    id: "tack",
    name: "tack",
    quantity: 1,
    training: 1,
    combat: 2,
    initiative: 3,
    sex: "F",
    ability: "+2 initiative to her squad when she has the highest initiative.",
    bio: "Is a tactical driving instructor for the LAPD.",
    image: "/mercs/tack.jpg"
  },
  {
    id: "tao",
    name: "tao",
    quantity: 1,
    training: 1,
    combat: 3,
    initiative: 1,
    ability: "Will not harm dogs.",
    bio: "He's also a french-trained pastry chef.",
    image: "/mercs/tao.jpg"
  },
  {
    id: "tavisto",
    name: "tavisto",
    quantity: 1,
    training: 3,
    combat: 2,
    initiative: 2,
    ability: "+1 to all skills when a woman is in his squad.",
    bio: "Don't pee in my Cheerios!",
    image: "/mercs/tavisto.jpg"
  },
  {
    id: "teresa",
    name: "teresa",
    quantity: 1,
    training: 0,
    combat: 0,
    initiative: 0,
    sex: "F",
    ability: "Doesn't count toward team limit.",
    bio: "Was working for Red Cross when the Rebels invaded.",
    image: "/mercs/teresa.jpg"
  },
  {
    id: "valkyrie",
    name: "valkyrie",
    quantity: 1,
    training: 2,
    combat: 3,
    initiative: 4,
    sex: "F",
    ability: "Gives +1 initiative to all other MERCs in her squad.",
    bio: "She's also a classicly trained opera singer.",
    image: "/mercs/valkyrie.jpg"
  },
  {
    id: "vandal",
    name: "vandal",
    quantity: 1,
    training: 1,
    combat: 3,
    initiative: 1,
    ability: "Fires a second shot at the end of each round of combat.",
    bio: "Freelance hitman, before joining MERC.",
    image: "/mercs/vandal.jpg"
  },
  {
    id: "vandradi",
    name: "vandradi",
    quantity: 1,
    training: 2,
    combat: 2,
    initiative: 3,
    ability: "+1 combat when using a weapon that adds 1 or more targets.",
    bio: "Hell comes with me.",
    image: "/mercs/vandradi.jpg"
  },
  {
    id: "vrbansk",
    name: "vrbansk",
    quantity: 1,
    training: 2,
    combat: 2,
    initiative: 3,
    ability: "When he's hired, give him the top card from the accessories deck.",
    bio: "This ain't no f\\*\\*\\* around operation.",
    image: "/mercs/vrbansk.jpg"
  },
  {
    id: "vulture",
    name: "vulture",
    quantity: 1,
    training: 1,
    combat: 2,
    initiative: 3,
    ability: "Ignores initiative penalties from equipment.",
    bio: "Has a degree in architecture.",
    image: "/mercs/vulture.jpg"
  },
  {
    id: "walter",
    name: "walter",
    quantity: 1,
    training: 7,
    combat: 2,
    initiative: 0,
    ability: "+2 Initiative to his militia when he's present.",
    bio: "He's very proud of his grandson.",
    image: "/mercs/walter.jpg"
  },
  {
    id: "wolverine",
    name: "wolverine",
    quantity: 1,
    training: 4,
    combat: 2,
    initiative: 4,
    ability: "Any 6s rolled during combat may be used on targets other than his declared target.",
    bio: "Semper Fi, motherf\\*\\*\\*er.",
    image: "/mercs/wolverine.jpg"
  },
  {
    id: "adelheid",
    name: "Adelheid",
    quantity: 1,
    training: 2,
    combat: 1,
    initiative: 2,
    sex: "F",
    ability: "Each hit targeting militia can convert the militia to her side rather than killing it.",
    bio: "Everyone loves their mom.",
    image: "/mercs/adelheid.jpg"
  },
  {
    id: "dutch",
    name: "Dutch",
    quantity: 1,
    training: 2,
    combat: 2,
    initiative: 1,
    ability: "If he has no weapon add +1 to his combat and initiative, as he always carries his sword.",
    bio: "Is a world-class sword fighting instructor.",
    image: "/mercs/dutch.jpg"
  },
  {
    id: "golem",
    name: "golem",
    quantity: 1,
    training: 2,
    combat: 3,
    initiative: 3,
    ability: "May attack any 1 target before the first round of combat.",
    bio: "I am a sneaky bastard. Sir!",
    image: "/mercs/golem.jpg"
  },
  {
    id: "hagness",
    name: "hagness",
    quantity: 1,
    training: 2,
    combat: 2,
    initiative: 2,
    ability: "Spend 1 action to draw 3 pieces of equipment, choose 1 and give it to any member of his squad.",
    bio: "He's a natural negotiator.",
    image: "/mercs/hagness.jpg"
  },
  {
    id: "moe",
    name: "moe",
    quantity: 1,
    training: 3,
    combat: 2,
    initiative: 3,
    ability: "+1 target when using a SMAW.",
    bio: "Been there. Done that. Let's do it again.",
    image: "/mercs/moe.jpg"
  }
];

// data/equipment.json
var equipment_default = [
  {
    id: "9mm-handgun",
    name: "9mm Handgun",
    quantity: 2,
    type: "Weapon",
    serial: 510,
    combat: 1,
    negatesArmor: false,
    description: "",
    image: "{$gun1}"
  },
  {
    id: "9mm-handgun-with-ap-ammo",
    name: "9mm Handgun with AP Ammo",
    quantity: 2,
    type: "Weapon",
    serial: 530,
    combat: 1,
    negatesArmor: true,
    description: "",
    image: "{$gun1}"
  },
  {
    id: "9mm-handgun-with-laser-sight",
    name: "9mm Handgun with Laser Sight",
    quantity: 2,
    type: "Weapon",
    serial: 550,
    combat: 1,
    initiative: 2,
    negatesArmor: false,
    description: "",
    image: "{$gun1}"
  },
  {
    id: "45-caliber-handgun",
    name: "45 Caliber Handgun",
    quantity: 2,
    type: "Weapon",
    serial: 570,
    combat: 2,
    negatesArmor: false,
    description: "",
    image: "{$gun2}"
  },
  {
    id: "45-caliber-handgun-with-ap-ammo",
    name: "45 Caliber Handgun with AP Ammo",
    quantity: 2,
    type: "Weapon",
    serial: 590,
    combat: 2,
    negatesArmor: true,
    description: "",
    image: "{$gun2}"
  },
  {
    id: "45-caliber-handgun-with-laser-sight",
    name: "45 Caliber Handgun with Laser Sight",
    quantity: 2,
    type: "Weapon",
    serial: 610,
    combat: 2,
    initiative: 2,
    negatesArmor: false,
    description: "",
    image: "{$gun2}"
  },
  {
    id: "50-caliber-rifle",
    name: "50 Caliber Rifle",
    quantity: 1,
    type: "Weapon",
    serial: 750,
    combat: 5,
    negatesArmor: false,
    description: "",
    image: "{$gun6}"
  },
  {
    id: "50-caliber-rifle-with-flir-scope",
    name: "50 Caliber Rifle with FLIR Scope",
    quantity: 1,
    type: "Weapon",
    serial: 770,
    combat: 5,
    initiative: 3,
    negatesArmor: false,
    description: "",
    image: "{$gun6}"
  },
  {
    id: "ak-47",
    name: "AK-47",
    quantity: 1,
    type: "Weapon",
    serial: 710,
    combat: 4,
    negatesArmor: false,
    description: "",
    image: "{$gun5}"
  },
  {
    id: "ak-47-with-bipod",
    name: "AK-47 with Bipod",
    quantity: 1,
    type: "Weapon",
    serial: 730,
    combat: 4,
    initiative: 1,
    negatesArmor: false,
    description: "",
    image: "{$gun5}"
  },
  {
    id: "ak-47-with-burst-fire",
    name: "AK-47 with Burst Fire",
    quantity: 1,
    type: "Weapon",
    serial: 870,
    combat: 3,
    targets: 1,
    negatesArmor: false,
    description: "",
    image: "{$gun5}"
  },
  {
    id: "ak-47-with-full-auto",
    name: "AK-47 with Full Auto",
    quantity: 1,
    type: "Weapon",
    serial: 910,
    combat: 2,
    targets: 2,
    negatesArmor: false,
    description: "",
    image: "{$gun5}"
  },
  {
    id: "army-fm-30-25",
    name: "Army FM 30-25",
    quantity: 2,
    type: "Accessory",
    serial: 490,
    training: 2,
    negatesArmor: false,
    description: "",
    image: "https://s3.amazonaws.com/files.component.studio/F10F99A8-0C1C-11E8-829E-E1B0E261B13A/field-manual.png"
  },
  {
    id: "attack-dog",
    name: "Attack Dog",
    quantity: 2,
    type: "Accessory",
    serial: 190,
    initiative: 1,
    negatesArmor: false,
    description: "Assign to an enemy MERC on your initiative before your attack. Assigned MERC can take no action except to attack the dog. Dog has 3 health.",
    image: "https://s3.amazonaws.com/files.component.studio/F3BCB4E2-0C1C-11E8-829E-E1B0E261B13A/attack-dog.png"
  },
  {
    id: "bandolier",
    name: "Bandolier",
    quantity: 2,
    type: "Accessory",
    serial: 980,
    negatesArmor: false,
    description: "Gives 2 extra accessory slots. Cannot be combined with another bandolier.",
    image: "https://s3.amazonaws.com/files.component.studio/BB865A6A-0C1C-11E8-829E-E1B0E261B13A/bandolier.png"
  },
  {
    id: "body-armor",
    name: "Body Armor",
    quantity: 2,
    type: "Armor",
    serial: 370,
    combat: -1,
    initiative: -1,
    armor: 3,
    negatesArmor: false,
    description: "",
    image: "{$armor3}"
  },
  {
    id: "body-armor-with-ceramic-plates",
    name: "Body Armor with Ceramic Plates",
    quantity: 1,
    type: "Armor",
    serial: 310,
    combat: -1,
    initiative: -2,
    armor: 4,
    negatesArmor: false,
    description: "",
    image: "{$armor3}"
  },
  {
    id: "body-armor-with-ceramic-plates-and-kevlar-helmet",
    name: "Body Armor with Ceramic Plates and Kevlar Helmet",
    quantity: 1,
    type: "Armor",
    serial: 330,
    combat: -2,
    initiative: -2,
    armor: 5,
    negatesArmor: false,
    description: "",
    image: "{$armor3}"
  },
  {
    id: "epinephrine-shot",
    name: "Epinephrine Shot",
    quantity: 2,
    type: "Accessory",
    serial: 230,
    negatesArmor: false,
    description: "Discard to prevent the death of self or another MERC, restores 1 health.",
    image: "https://s3.amazonaws.com/files.component.studio/F3F9A938-0C1C-11E8-8984-B75AE261B13A/epinephrine.png"
  },
  {
    id: "field-radio",
    name: "Field Radio",
    quantity: 2,
    type: "Accessory",
    serial: 430,
    training: 1,
    initiative: 1,
    negatesArmor: false,
    description: "",
    image: "https://s3.amazonaws.com/files.component.studio/F5688B72-0C1C-11E8-8984-B75AE261B13A/field-radio.png"
  },
  {
    id: "first-aid-kit",
    name: "First Aid Kit",
    quantity: 2,
    type: "Accessory",
    serial: 150,
    negatesArmor: false,
    description: "On your initiative before your attack, discard 1 combat dice to heal 1 wound (per die discarded) on self or another MERC. Discard after 1 use.",
    image: "{$firstaidkit}"
  },
  {
    id: "flak-vest",
    name: "Flak Vest",
    quantity: 1,
    type: "Armor",
    serial: 470,
    armor: 1,
    negatesArmor: false,
    description: "",
    image: "{$armor1}"
  },
  {
    id: "flak-vest-with-ceramic-plates-and-kevlar-helmet",
    name: "Flak Vest with Ceramic Plates and Kevlar Helmet",
    quantity: 1,
    type: "Armor",
    serial: 290,
    combat: -1,
    initiative: -1,
    armor: 3,
    negatesArmor: false,
    description: "",
    image: "{$armor1}"
  },
  {
    id: "flak-vest-with-kevlar-helmet",
    name: "Flak Vest with Kevlar Helmet",
    quantity: 1,
    type: "Armor",
    serial: 250,
    initiative: -1,
    armor: 2,
    negatesArmor: false,
    description: "",
    image: "{$armor1}"
  },
  {
    id: "fragmentation-grenade",
    name: "Fragmentation Grenade",
    quantity: 2,
    type: "Accessory",
    serial: 930,
    combat: 4,
    targets: 3,
    initiative: -2,
    negatesArmor: false,
    description: "Discard after 1 attack.",
    image: "https://s3.amazonaws.com/files.component.studio/F3F25502-0C1C-11E8-8984-B75AE261B13A/fragmentation-grenade.png"
  },
  {
    id: "full-body-armor",
    name: "Full Body Armor",
    quantity: 2,
    type: "Armor",
    serial: 410,
    combat: -2,
    initiative: -3,
    armor: 6,
    negatesArmor: false,
    description: "",
    image: "{$armor4}"
  },
  {
    id: "ghillie-suit",
    name: "Ghillie Suit",
    quantity: 2,
    type: "Armor",
    serial: 450,
    initiative: 2,
    negatesArmor: false,
    description: "",
    image: "https://s3.amazonaws.com/files.component.studio/F5BD31E0-0C1C-11E8-829E-E1B0E261B13A/ghillie-suit.png"
  },
  {
    id: "grenade",
    name: "Grenade",
    quantity: 2,
    type: "Accessory",
    serial: 890,
    combat: 3,
    targets: 2,
    initiative: -2,
    negatesArmor: false,
    description: "Discard after 1 attack.",
    image: "https://s3.amazonaws.com/files.component.studio/F3E79270-0C1C-11E8-8984-B75AE261B13A/grenade.png"
  },
  {
    id: "kevlar-vest",
    name: "Kevlar Vest",
    quantity: 2,
    type: "Armor",
    serial: 350,
    initiative: -1,
    armor: 2,
    negatesArmor: false,
    description: "",
    image: "{$armor2}"
  },
  {
    id: "kevlar-vest-with-ceramic-plates",
    name: "Kevlar Vest with Ceramic Plates",
    quantity: 2,
    type: "Armor",
    serial: 390,
    combat: -1,
    initiative: -1,
    armor: 3,
    negatesArmor: false,
    description: "",
    image: "{$armor2}"
  },
  {
    id: "kevlar-vest-with-ceramic-plates-and-kevlar-helmet",
    name: "Kevlar Vest with Ceramic Plates and Kevlar Helmet",
    quantity: 2,
    type: "Armor",
    serial: 270,
    combat: -1,
    initiative: -2,
    armor: 4,
    negatesArmor: false,
    description: "",
    image: "{$armor2}"
  },
  {
    id: "land-mine",
    name: "Land Mine",
    quantity: 2,
    type: "Accessory",
    serial: 110,
    negatesArmor: false,
    description: "Place in an equipment stash in a sector you control. When an enemy enters the sector, declare you have planted a mine and it will explode dealing 1 damage to every target.",
    image: "https://s3.amazonaws.com/files.component.studio/F4BF4A58-0C1C-11E8-829E-E1B0E261B13A/landmine.png"
  },
  {
    id: "m16",
    name: "M16",
    quantity: 1,
    type: "Weapon",
    serial: 630,
    combat: 3,
    negatesArmor: false,
    description: "",
    image: "{$gun4}"
  },
  {
    id: "m16-with-ap-ammo",
    name: "M16 with AP Ammo",
    quantity: 1,
    type: "Weapon",
    serial: 650,
    combat: 3,
    negatesArmor: true,
    description: "",
    image: "{$gun4}"
  },
  {
    id: "m16-with-burst-fire",
    name: "M16 with Burst Fire",
    quantity: 1,
    type: "Weapon",
    serial: 850,
    combat: 2,
    targets: 1,
    negatesArmor: false,
    description: "",
    image: "{$gun4}"
  },
  {
    id: "m16-with-laser-sight",
    name: "M16 with Laser Sight",
    quantity: 1,
    type: "Weapon",
    serial: 670,
    combat: 3,
    initiative: 2,
    negatesArmor: false,
    description: "",
    image: "{$gun4}"
  },
  {
    id: "medical-kit",
    name: "Medical Kit",
    quantity: 2,
    type: "Accessory",
    serial: 170,
    negatesArmor: false,
    description: "On your initiative, before your attack, discard 1 combat dice to heal 1 wound (per dice discarded) on self or another MERC. Discard after 3 uses.",
    image: "{$medicalkit}"
  },
  {
    id: "repair-kit",
    name: "Repair Kit",
    quantity: 2,
    type: "Accessory",
    serial: 130,
    negatesArmor: false,
    description: "Discard this card to take 1 card from any equipment discard pile.",
    image: "https://s3.amazonaws.com/files.component.studio/6AD4E0DA-A0E9-11EC-A2D8-901905252F8C/repair-kit.png"
  },
  {
    id: "smaw",
    name: "SMAW",
    quantity: 2,
    type: "Weapon",
    serial: 790,
    combat: 10,
    initiative: -2,
    negatesArmor: false,
    description: "",
    image: "https://s3.amazonaws.com/files.component.studio/F5543794-0C1C-11E8-829E-E1B0E261B13A/smaw.png"
  },
  {
    id: "uzi",
    name: "Uzi",
    quantity: 2,
    type: "Weapon",
    serial: 810,
    targets: 1,
    negatesArmor: false,
    description: "",
    image: "{$gun3}"
  },
  {
    id: "uzi-with-ap-ammo",
    name: "Uzi with AP Ammo",
    quantity: 2,
    type: "Weapon",
    serial: 830,
    targets: 1,
    negatesArmor: true,
    description: "",
    image: "{$gun3}"
  },
  {
    id: "chopper",
    name: "Chopper",
    quantity: 1,
    type: "Accessory",
    serial: 0,
    combat: 1,
    armor: 1,
    negatesArmor: false,
    description: "For 1 action move 2 spaces a squad of up to 4 MERCs/militia. Movement may be diagonal.",
    image: "https://s3.amazonaws.com/files.component.studio/1A7B5448-89D8-11EC-8D24-D816C1E58150/helicopter.png",
    expansion: "A"
  },
  {
    id: "detonator",
    name: "Detonator",
    quantity: 1,
    type: "Accessory",
    serial: 0,
    negatesArmor: false,
    description: "If you also have the Explosives you win! Each Rebel may not have more than 1.",
    image: "https://s3.amazonaws.com/files.component.studio/7CD50E20-89EE-11EC-B666-4BF238A650D8/circuit-board.png",
    expansion: "B"
  },
  {
    id: "deuce",
    name: "Deuce",
    quantity: 1,
    type: "Accessory",
    serial: 0,
    armor: 1,
    negatesArmor: false,
    description: "For 1 action move 1 space a squad of up to 10 MERCs/militia.",
    image: "https://s3.amazonaws.com/files.component.studio/11DF3BBA-89D8-11EC-8D24-7316C1E58150/deuce.png",
    expansion: "A"
  },
  {
    id: "explosives",
    name: "Explosives",
    quantity: 1,
    type: "Accessory",
    serial: 0,
    negatesArmor: false,
    description: "If you also have a Detonator, you win! Each Rebel may not have more than 1.",
    image: "https://s3.amazonaws.com/files.component.studio/7CE98792-89EE-11EC-8D24-3312C1E58150/barrel.png",
    expansion: "B"
  },
  {
    id: "humvee",
    name: "Humvee",
    quantity: 1,
    type: "Accessory",
    serial: 0,
    combat: 1,
    armor: 3,
    negatesArmor: false,
    description: "For 1 action move 2 spaces a squad of up to 4 MERCs/militia.",
    image: "https://s3.amazonaws.com/files.component.studio/1D9DF6F8-89D8-11EC-8D24-F216C1E58150/humvee.png",
    expansion: "A"
  },
  {
    id: "jeep",
    name: "Jeep",
    quantity: 1,
    type: "Accessory",
    serial: 0,
    armor: 1,
    negatesArmor: false,
    description: "For 1 action move 2 spaces a squad of up to 4 MERCs/militia.",
    image: "https://s3.amazonaws.com/files.component.studio/20C70A68-89D8-11EC-8D24-1816C1E58150/jeep.png",
    expansion: "A"
  },
  {
    id: "tank",
    name: "Tank",
    quantity: 1,
    type: "Accessory",
    serial: 0,
    combat: 3,
    initiative: -1,
    armor: 6,
    negatesArmor: false,
    description: "For 2 actions move 1 space a squad of up to 4 MERCs/militia.",
    image: "https://s3.amazonaws.com/files.component.studio/254F2E4E-89D8-11EC-8D24-9416C1E58150/tank.png",
    expansion: "A"
  }
];

// data/sectors.json
var sectors_default = [
  {
    id: "industry---bauxite",
    name: "Bauxite Industry",
    quantity: 1,
    type: "Industry",
    value: 5,
    weapons: 2,
    armor: 1,
    accessories: 2,
    image: "/sectors/industry---bauxite.jpg"
  },
  {
    id: "industry---coal",
    name: "Coal Industry",
    quantity: 1,
    type: "Industry",
    value: 5,
    weapons: 1,
    armor: 1,
    accessories: 3,
    image: "/sectors/industry---coal.jpg"
  },
  {
    id: "industry---cocaine",
    name: "Cocaine Industry",
    quantity: 1,
    type: "Industry",
    value: 6,
    weapons: 4,
    armor: 1,
    accessories: 1,
    image: "/sectors/industry---cocaine.jpg"
  },
  {
    id: "industry---coffee",
    name: "Coffee Industry",
    quantity: 1,
    type: "Industry",
    value: 4,
    weapons: 2,
    armor: 1,
    accessories: 1,
    image: "/sectors/industry---coffee.jpg"
  },
  {
    id: "industry---copper",
    name: "Copper Industry",
    quantity: 1,
    type: "Industry",
    value: 6,
    weapons: 2,
    armor: 1,
    accessories: 3,
    image: "/sectors/industry---copper.jpg"
  },
  {
    id: "industry---diamond",
    name: "Diamond Industry",
    quantity: 1,
    type: "Industry",
    value: 6,
    weapons: 3,
    armor: 1,
    accessories: 2,
    image: "/sectors/industry---diamond.jpg"
  },
  {
    id: "industry---fishing",
    name: "Fishing Industry",
    quantity: 1,
    type: "Industry",
    value: 4,
    weapons: 1,
    armor: 1,
    accessories: 2,
    image: "/sectors/industry---fishing.jpg"
  },
  {
    id: "industry---gold",
    name: "Gold Industry",
    quantity: 1,
    type: "Industry",
    value: 6,
    weapons: 2,
    armor: 1,
    accessories: 3,
    image: "/sectors/industry---gold.jpg"
  },
  {
    id: "town---a",
    name: "Hamadu City",
    quantity: 1,
    type: "City",
    value: 2,
    weapons: 1,
    armor: 0,
    accessories: 1,
    image: "/sectors/town---a.jpg"
  },
  {
    id: "wilderness9",
    name: "Wilderness",
    quantity: 1,
    type: "Wilderness",
    value: 1,
    weapons: 0,
    armor: 0,
    accessories: 1,
    image: "/sectors/wilderness9.jpg"
  },
  {
    id: "wilderness10",
    name: "Wilderness",
    quantity: 1,
    type: "Wilderness",
    value: 1,
    weapons: 0,
    armor: 0,
    accessories: 1,
    image: "/sectors/wilderness10.jpg"
  },
  {
    id: "wilderness11",
    name: "Wilderness",
    quantity: 1,
    type: "Wilderness",
    value: 1,
    weapons: 0,
    armor: 0,
    accessories: 1,
    image: "/sectors/wilderness11.jpg"
  },
  {
    id: "wilderness12",
    name: "Wilderness",
    quantity: 1,
    type: "Wilderness",
    value: 1,
    weapons: 0,
    armor: 0,
    accessories: 1,
    image: "/sectors/wilderness12.jpg"
  },
  {
    id: "wilderness13",
    name: "Wilderness",
    quantity: 1,
    type: "Wilderness",
    value: 1,
    weapons: 0,
    armor: 0,
    accessories: 1,
    image: "/sectors/wilderness13.jpg"
  },
  {
    id: "wilderness14",
    name: "Wilderness",
    quantity: 1,
    type: "Wilderness",
    value: 1,
    weapons: 0,
    armor: 0,
    accessories: 1,
    image: "/sectors/wilderness14.jpg"
  },
  {
    id: "wilderness20",
    name: "Wilderness",
    quantity: 1,
    type: "Wilderness",
    value: 1,
    weapons: 0,
    armor: 0,
    accessories: 1,
    image: "/sectors/wilderness20.jpg"
  },
  {
    id: "industry---iron",
    name: "Iron Industry",
    quantity: 1,
    type: "Industry",
    value: 4,
    weapons: 1,
    armor: 1,
    accessories: 2,
    image: "/sectors/industry---iron.jpg"
  },
  {
    id: "industry---oil",
    name: "Oil Industry",
    quantity: 1,
    type: "Industry",
    value: 6,
    weapons: 2,
    armor: 1,
    accessories: 3,
    image: "/sectors/industry---oil.jpg"
  },
  {
    id: "industry---opium",
    name: "Opium Industry",
    quantity: 1,
    type: "Industry",
    value: 5,
    weapons: 3,
    armor: 1,
    accessories: 1,
    image: "/sectors/industry---opium.jpg"
  },
  {
    id: "industry---resort",
    name: "Resort Industry",
    quantity: 1,
    type: "Industry",
    value: 6,
    weapons: 2,
    armor: 1,
    accessories: 3,
    image: "/sectors/industry---resort.jpg"
  },
  {
    id: "industry---silver",
    name: "Silver Industry",
    quantity: 1,
    type: "Industry",
    value: 5,
    weapons: 2,
    armor: 1,
    accessories: 2,
    image: "/sectors/industry---silver.jpg"
  },
  {
    id: "town---b",
    name: "Nagrilli City",
    quantity: 1,
    type: "City",
    value: 2,
    weapons: 1,
    armor: 0,
    accessories: 1,
    image: "/sectors/town---b.jpg"
  },
  {
    id: "town---c",
    name: "Ambrico City",
    quantity: 1,
    type: "City",
    value: 2,
    weapons: 1,
    armor: 0,
    accessories: 1,
    image: "/sectors/town---c.jpg"
  },
  {
    id: "wilderness",
    name: "Wilderness",
    quantity: 1,
    type: "Wilderness",
    value: 1,
    weapons: 0,
    armor: 0,
    accessories: 1,
    image: "/sectors/wilderness.jpg"
  },
  {
    id: "wilderness2",
    name: "Wilderness",
    quantity: 1,
    type: "Wilderness",
    value: 1,
    weapons: 0,
    armor: 0,
    accessories: 1,
    image: "/sectors/wilderness2.jpg"
  },
  {
    id: "wilderness3",
    name: "Wilderness",
    quantity: 1,
    type: "Wilderness",
    value: 1,
    weapons: 0,
    armor: 0,
    accessories: 1,
    image: "/sectors/wilderness3.jpg"
  },
  {
    id: "wilderness4",
    name: "Wilderness",
    quantity: 1,
    type: "Wilderness",
    value: 1,
    weapons: 0,
    armor: 0,
    accessories: 1,
    image: "/sectors/wilderness4.jpg"
  },
  {
    id: "wilderness5",
    name: "Wilderness",
    quantity: 1,
    type: "Wilderness",
    value: 1,
    weapons: 0,
    armor: 0,
    accessories: 1,
    image: "/sectors/wilderness5.jpg"
  },
  {
    id: "wilderness7",
    name: "Wilderness",
    quantity: 1,
    type: "Wilderness",
    value: 1,
    weapons: 0,
    armor: 0,
    accessories: 1,
    image: "/sectors/wilderness7.jpg"
  },
  {
    id: "wilderness8",
    name: "Wilderness",
    quantity: 1,
    type: "Wilderness",
    value: 1,
    weapons: 0,
    armor: 0,
    accessories: 1,
    image: "/sectors/wilderness8.jpg"
  }
];

// data/dictators.json
var dictators_default = [
  {
    id: "castro",
    name: "Castro",
    quantity: 1,
    initiative: 2,
    combat: 2,
    training: 2,
    ability: "Once per turn, draw 3 random MERCs and hire 1.",
    bio: "President, Cuba, 1959-2008",
    image: "https://s3.amazonaws.com/files.component.studio/0C4FEE44-A001-11EC-AAF0-7BAAC3E846F2/castro.png"
  },
  {
    id: "kim",
    name: "Kim",
    quantity: 1,
    initiative: 2,
    combat: 1,
    training: 3,
    ability: "Your base starts revealed with 5 militia per Rebel (max 20). Once per turn, count the number of Rebel controlled sectors, and place that many militia on any sector.",
    bio: "Supreme Leader, North Korea, 1948-1994",
    image: "https://s3.amazonaws.com/files.component.studio/58D21B64-A021-11EC-A2D8-C4D604252F8C/kim.png"
  }
];

// data/dictator-tactics.json
var dictator_tactics_default = [
  {
    id: "artillery-barrage",
    name: "Artillery Barrage",
    quantity: 1,
    story: "You use a stockpile of mortars to weaken enemy lines.",
    description: "Attack sectors adjacent to sectors you control. The max number of sectors you can attack is equal to the number of rebel players. Roll a D6 for each of these sectors, that's how many targets are hit. Each take 1 damage. Rebels can choose whether to apply the hits to MERCs or militia."
  },
  {
    id: "better-weapons",
    name: "Better Weapons",
    quantity: 1,
    story: "You decide to stop being cheap and upgrade your militia's guns.",
    description: "Reveal your base if you have not already done so."
  },
  {
    id: "family-threat",
    name: "Family Threat",
    quantity: 1,
    story: "You threaten to round up and kill the children who cannot show 2 parents when your militia come to the house.",
    description: "Your threats are working. Each rebel sector loses 2 militia as they run home to their families."
  },
  {
    id: "fodder",
    name: "Fodder",
    quantity: 1,
    story: "So what if you lose some militia? Maybe it will distract the rebels long enough for you to form a better plan.",
    description: "Look for the sectors containing the most militia for each rebel player. Divide the number of their militia in half (round up). Send that many of your militia to those sectors. Resolve combat immediately."
  },
  {
    id: "generalisimo",
    name: "Generalisimo",
    quantity: 1,
    story: "It's time to bring out the big guns.",
    description: "Reveal your base if you have not already done so."
  },
  {
    id: "lockdown",
    name: "Lockdown",
    quantity: 1,
    story: "It's time to prepare for the assault.",
    description: "Reveal your base if you have not already done so."
  },
  {
    id: "reinforcements",
    name: "Reinforcements",
    quantity: 1,
    story: "Sending your palace guards to assist in the fight, may break the backs of the rebels.",
    description: "Count the number of rebel players, and add that many of your militia to every Industry you control."
  },
  {
    id: "seizure",
    name: "Seizure",
    quantity: 1,
    story: "You order your rural residents to turn over all their firearms and supplies.",
    description: "X = the number of rebel players."
  },
  {
    id: "sentry",
    name: "Sentry",
    quantity: 1,
    story: "In an effort to slow movement, put pressure on your citizens, and increase intelligence and attrition, you populate the country-side with your militia.",
    description: "Count half the number of rebel players (round up). Add that many of your militia to every sector that is not controlled by anybody."
  },
  {
    id: "veteran-militia",
    name: "Veteran Militia",
    quantity: 1,
    story: "You train better militia by using your elite guards to train them.",
    description: "Reveal your base if you have not already done so."
  },
  {
    id: "block-trade",
    name: "Block Trade",
    quantity: 1,
    story: "Perhaps you can stop the rebels if you take away their ability to re-supply.",
    description: "Flip all cities to their explored side."
  },
  {
    id: "conscripts",
    name: "Conscripts",
    quantity: 1,
    story: "You have decided to conscript children into your militia.",
    description: "Count half the number of rebel players (round up). At the end of your turn, add that many of your militia to each sector you control. Do this at the end of each of your turns for the remainder of the game."
  },
  {
    id: "oil-reserves",
    name: "Oil Reserves",
    quantity: 1,
    story: "You decide to crank up your oil refinery so your MERCs can be more effective.",
    description: "For the remainder of the game, whoever controls the oil industry gains 1 free move action for their MERCs."
  },
  {
    id: "tainted-water",
    name: "Tainted Water",
    quantity: 1,
    story: "You are merciless and would rather kill your own citizens than give up your island. You poison the water supply.",
    description: "Count half the number of rebel players (round up). Remove that many rebel militia from each sector and deal 1 damage to each rebel MERC, regardless of armor."
  }
];

// data/setup.json
var setup_default = {
  setupConfigurations: [
    {
      rebels: 1,
      mapSize: [3, 3],
      sectorTypes: {
        industries: 4,
        cities: 1,
        wilderness: 4
      },
      dictatorStrength: {
        difficulty: 2,
        extra: 0
      }
    },
    {
      rebels: 2,
      mapSize: [3, 4],
      sectorTypes: {
        industries: 6,
        cities: 1,
        wilderness: 5
      },
      dictatorStrength: {
        difficulty: 3,
        extra: 4
      }
    },
    {
      rebels: 3,
      mapSize: [4, 4],
      sectorTypes: {
        industries: 8,
        cities: 1,
        wilderness: 7
      },
      dictatorStrength: {
        difficulty: 4,
        extra: 9
      }
    },
    {
      rebels: 4,
      mapSize: [4, 5],
      sectorTypes: {
        industries: 10,
        cities: 2,
        wilderness: 8
      },
      dictatorStrength: {
        difficulty: 5,
        extra: 12
      }
    },
    {
      rebels: 5,
      mapSize: [5, 5],
      sectorTypes: {
        industries: 12,
        cities: 2,
        wilderness: 11
      },
      dictatorStrength: {
        difficulty: 6,
        extra: 15
      }
    },
    {
      rebels: 6,
      mapSize: [5, 6],
      sectorTypes: {
        industries: 13,
        cities: 3,
        wilderness: 14
      },
      dictatorStrength: {
        difficulty: 7,
        extra: 18
      }
    }
  ]
};

// src/rules/game.ts
var RebelPlayer = class extends Player {
  playerColor;
  // Squads (set by game after creation)
  primarySquad;
  secondarySquad;
  // Player area
  area;
  get team() {
    const mercs = [];
    if (this.primarySquad) mercs.push(...this.primarySquad.getMercs());
    if (this.secondarySquad) mercs.push(...this.secondarySquad.getMercs());
    return mercs;
  }
  get teamSize() {
    return this.team.filter((m) => m.mercId !== "teresa").length;
  }
  // Team limit: BASE_TEAM_LIMIT + controlled sectors (from game constants)
  getTeamLimit(game) {
    return TeamConstants.BASE_TEAM_LIMIT + game.getControlledSectors(this).length;
  }
  canHireMerc(game) {
    return this.teamSize < this.getTeamLimit(game);
  }
};
var DictatorPlayer = class extends Player {
  dictator;
  tacticsDeck;
  tacticsHand;
  tacticsDiscard;
  // Hired MERCs fighting for the Dictator
  hiredMercs = [];
  // Base state
  baseRevealed = false;
  baseSectorId;
  // Sector where the Dictator's forces are stationed
  stationedSectorId;
  // MERC-5j2: AI mode - dictator plays cards from deck top, no hand
  isAI = true;
  // MERC-q4v: Privacy Player - Rebel designated to handle AI decisions
  privacyPlayerId;
  get isDefeated() {
    return this.baseRevealed && this.dictator?.isDead;
  }
  get team() {
    return this.hiredMercs.filter((m) => !m.isDead);
  }
  get teamSize() {
    return this.team.length;
  }
};
var MERCGame = class _MERCGame extends Game {
  // Static storage for playerCount during construction (workaround for super() timing)
  static _pendingPlayerCount = 2;
  // Configuration
  rebelCount;
  setupConfig;
  currentDay = 1;
  // Game Map
  gameMap;
  // Card pools (master decks)
  mercDeck;
  weaponsDeck;
  armorDeck;
  accessoriesDeck;
  // Discard piles
  mercDiscard;
  weaponsDiscard;
  armorDiscard;
  accessoriesDiscard;
  rebelPlayers = [];
  // MERC-a2h: Track pending coordinated attacks across multiple rebel players
  // Key: target sectorId, Value: array of { playerId, squadType }
  pendingCoordinatedAttacks = /* @__PURE__ */ new Map();
  // MERC-n1f: Interactive combat state
  // Tracks active combat that's paused for player decision (retreat/continue)
  activeCombat = null;
  // Data loaded from JSON
  mercData = [];
  equipmentData = [];
  sectorData = [];
  dictatorData = [];
  tacticsData = [];
  setupConfigurations = [];
  constructor(options) {
    _MERCGame._pendingPlayerCount = options.playerCount ?? 2;
    super(options);
    this._ctx.classRegistry.set("MercCard", MercCard);
    this._ctx.classRegistry.set("Equipment", Equipment);
    this._ctx.classRegistry.set("Sector", Sector);
    this._ctx.classRegistry.set("DictatorCard", DictatorCard);
    this._ctx.classRegistry.set("TacticsCard", TacticsCard);
    this._ctx.classRegistry.set("Squad", Squad);
    this._ctx.classRegistry.set("MercDeck", MercDeck);
    this._ctx.classRegistry.set("EquipmentDeck", EquipmentDeck);
    this._ctx.classRegistry.set("TacticsDeck", TacticsDeck);
    this._ctx.classRegistry.set("TacticsHand", TacticsHand);
    this._ctx.classRegistry.set("DiscardPile", DiscardPile);
    this._ctx.classRegistry.set("GameMap", GameMap);
    this._ctx.classRegistry.set("PlayerArea", PlayerArea);
    this.rebelCount = options.rebelCount ?? Math.max(1, this.players.length - 1);
    if (!this.dictatorPlayer) {
      throw new Error(`DictatorPlayer not created. Players: ${this.players.length}, pendingCount: ${_MERCGame._pendingPlayerCount}`);
    }
    this.mercDeck = this.create(MercDeck, "merc-deck");
    this.mercDeck.setOrder("stacking");
    this.weaponsDeck = this.create(EquipmentDeck, "weapons-deck", { equipmentType: "Weapon" });
    this.weaponsDeck.setOrder("stacking");
    this.armorDeck = this.create(EquipmentDeck, "armor-deck", { equipmentType: "Armor" });
    this.armorDeck.setOrder("stacking");
    this.accessoriesDeck = this.create(EquipmentDeck, "accessories-deck", { equipmentType: "Accessory" });
    this.accessoriesDeck.setOrder("stacking");
    this.mercDiscard = this.create(DiscardPile, "merc-discard");
    this.weaponsDiscard = this.create(DiscardPile, "weapons-discard");
    this.armorDiscard = this.create(DiscardPile, "armor-discard");
    this.accessoriesDiscard = this.create(DiscardPile, "accessories-discard");
    this.gameMap = this.create(GameMap, "game-map");
    registerAllActions(this);
    this.setFlow(createGameFlow(this));
    this.loadSetupConfig(setup_default);
    this.loadMercData(mercs_default);
    this.loadEquipmentData(equipment_default, options.expansionModes);
    this.loadSectorData(sectors_default);
    this.loadDictatorData(dictators_default);
    this.loadTacticsData(dictator_tactics_default);
    this.performSetup(options.dictatorId);
  }
  createPlayer(position, name) {
    if (!this.rebelPlayers) {
      this.rebelPlayers = [];
    }
    const totalPlayers = _MERCGame._pendingPlayerCount;
    const isDictator = position === totalPlayers - 1;
    if (isDictator) {
      const dictator = new DictatorPlayer(position, name);
      dictator.game = this;
      this.dictatorPlayer = dictator;
      return dictator;
    } else {
      const rebel = new RebelPlayer(position, name);
      rebel.game = this;
      const colors = ["red", "blue", "green", "yellow", "purple", "orange"];
      rebel.playerColor = colors[position % colors.length];
      rebel.primarySquad = this.create(Squad, `squad-${position}-primary`, { isPrimary: true });
      rebel.secondarySquad = this.create(Squad, `squad-${position}-secondary`, { isPrimary: false });
      rebel.area = this.create(PlayerArea, `area-${position}`);
      this.rebelPlayers.push(rebel);
      return rebel;
    }
  }
  /**
   * Check if a player is a rebel (not the dictator)
   */
  isRebelPlayer(player) {
    return player instanceof RebelPlayer;
  }
  /**
   * Check if a player is the dictator
   */
  isDictatorPlayer(player) {
    return player instanceof DictatorPlayer;
  }
  // ==========================================================================
  // Data Loading Methods
  // ==========================================================================
  loadMercData(data) {
    this.mercData = data;
    for (const merc of data) {
      for (let i = 0; i < merc.quantity; i++) {
        const suffix = merc.quantity > 1 ? `-${i + 1}` : "";
        this.mercDeck.create(MercCard, `merc-${merc.id}${suffix}`, {
          mercId: merc.id,
          mercName: merc.name,
          bio: merc.bio,
          ability: merc.ability,
          image: merc.image,
          baseInitiative: merc.initiative,
          baseTraining: merc.training,
          baseCombat: merc.combat
        });
      }
    }
  }
  loadEquipmentData(data, expansionModes = []) {
    this.equipmentData = data;
    for (const equip of data) {
      if (equip.expansion && !expansionModes.includes(equip.expansion)) {
        continue;
      }
      const deck = this.getEquipmentDeck(equip.type);
      if (!deck) continue;
      for (let i = 0; i < equip.quantity; i++) {
        const suffix = equip.quantity > 1 ? `-${i + 1}` : "";
        deck.create(Equipment, `equip-${equip.id}${suffix}`, {
          equipmentId: equip.id,
          equipmentName: equip.name,
          equipmentType: equip.type,
          serial: equip.serial,
          description: equip.description,
          image: equip.image,
          combatBonus: equip.combat ?? 0,
          initiative: equip.initiative ?? 0,
          training: equip.training ?? 0,
          targets: equip.targets ?? 0,
          armorBonus: equip.armor ?? 0,
          negatesArmor: equip.negatesArmor,
          expansion: equip.expansion
        });
      }
    }
  }
  loadSectorData(data) {
    this.sectorData = data;
  }
  loadDictatorData(data) {
    this.dictatorData = data;
  }
  loadTacticsData(data) {
    this.tacticsData = data;
  }
  loadSetupConfig(setupData) {
    this.setupConfigurations = setupData.setupConfigurations;
    const config = getSetupConfiguration(setupData, this.rebelCount);
    if (config) {
      this.setupConfig = config;
      const [cols, rows] = config.mapSize;
      this.gameMap.cols = cols;
      this.gameMap.rows = rows;
      this.gameMap.updateLabels();
    }
  }
  // Legacy method for array-based loading
  loadSetupConfigArray(configs) {
    this.loadSetupConfig({ setupConfigurations: configs });
  }
  // ==========================================================================
  // Game Setup Methods
  // ==========================================================================
  /**
   * Perform complete game setup using loaded data.
   * This should be called after all data is loaded via loadXxxData methods.
   *
   * @param dictatorId - Optional specific dictator to use (random if not specified)
   * @param activeTacticsCount - Number of active tactics cards (default: 5)
   */
  performSetup(dictatorId, activeTacticsCount) {
    if (!this.setupConfig) {
      throw new Error("Setup configuration not loaded. Call loadSetupConfig first.");
    }
    if (this.sectorData.length === 0) {
      throw new Error("Sector data not loaded. Call loadSectorData first.");
    }
    if (this.dictatorData.length === 0) {
      throw new Error("Dictator data not loaded. Call loadDictatorData first.");
    }
    if (this.tacticsData.length === 0) {
      throw new Error("Tactics data not loaded. Call loadTacticsData first.");
    }
    performSetup(this, {
      sectorData: this.sectorData,
      dictatorData: this.dictatorData,
      tacticsData: this.tacticsData,
      dictatorId,
      activeTacticsCount
    });
  }
  /**
   * Build just the map (useful for testing or custom setup)
   */
  buildMap() {
    if (!this.setupConfig) {
      throw new Error("Setup configuration not loaded");
    }
    if (this.sectorData.length === 0) {
      throw new Error("Sector data not loaded");
    }
    buildMap(this, this.sectorData);
  }
  /**
   * Set up just the dictator (useful for testing or custom setup)
   */
  setupDictator(dictatorId) {
    if (this.dictatorData.length === 0) {
      throw new Error("Dictator data not loaded");
    }
    return setupDictator(this, this.dictatorData, dictatorId);
  }
  /**
   * Set up just the tactics deck (useful for testing or custom setup)
   */
  setupTacticsDeck(activeTacticsCount) {
    if (this.tacticsData.length === 0) {
      throw new Error("Tactics data not loaded");
    }
    setupTacticsDeck(this, this.tacticsData, activeTacticsCount);
  }
  /**
   * Shuffle all decks
   */
  shuffleAllDecks() {
    shuffleDecks(this);
  }
  /**
   * Get a summary of the current setup state
   */
  getSetupSummary() {
    return getSetupSummary(this);
  }
  // ==========================================================================
  // Helper Methods
  // ==========================================================================
  getEquipmentDeck(type) {
    switch (type) {
      case "Weapon":
        return this.weaponsDeck;
      case "Armor":
        return this.armorDeck;
      case "Accessory":
        return this.accessoriesDeck;
      default:
        return void 0;
    }
  }
  getEquipmentDiscard(type) {
    switch (type) {
      case "Weapon":
        return this.weaponsDiscard;
      case "Armor":
        return this.armorDiscard;
      case "Accessory":
        return this.accessoriesDiscard;
      default:
        return void 0;
    }
  }
  drawEquipment(type) {
    const deck = this.getEquipmentDeck(type);
    const discard = this.getEquipmentDiscard(type);
    if (!deck || !discard) return void 0;
    let drawn = deck.drawTo(discard, 1, Equipment);
    if (drawn.length === 0 && discard.count(Equipment) > 0) {
      for (const eq of discard.all(Equipment)) {
        eq.putInto(deck);
      }
      deck.shuffle();
      drawn = deck.drawTo(discard, 1, Equipment);
    }
    return drawn[0];
  }
  drawMerc() {
    let drawn = this.mercDeck.drawTo(this.mercDiscard, 1, MercCard);
    if (drawn.length === 0 && this.mercDiscard.count(MercCard) > 0) {
      for (const merc of this.mercDiscard.all(MercCard)) {
        merc.putInto(this.mercDeck);
      }
      this.mercDeck.shuffle();
      drawn = this.mercDeck.drawTo(this.mercDiscard, 1, MercCard);
    }
    return drawn[0];
  }
  getSector(sectorId) {
    return this.gameMap.first(Sector, (s) => s.sectorId === sectorId);
  }
  getAdjacentSectors(sector2) {
    return this.gameMap.getAdjacentSectors(sector2);
  }
  // Get sectors controlled by a specific player
  // Per rules (11-victory-and-game-end.md): Units = MERCs + Militia, Dictator wins ties
  // MERC-eqe: For rebel vs rebel ties, lower position (earlier in turn order) wins
  getControlledSectors(player) {
    return this.gameMap.getAllSectors().filter((sector2) => {
      const dictatorUnits = this.getDictatorUnitsInSector(sector2);
      const totalRebelUnits = this.getTotalRebelUnitsInSector(sector2);
      if (player instanceof DictatorPlayer) {
        return dictatorUnits >= totalRebelUnits && dictatorUnits > 0;
      } else {
        const rebel = player;
        const rebelUnits = this.getRebelUnitsInSector(sector2, rebel);
        if (dictatorUnits >= rebelUnits) return false;
        for (const otherRebel of this.rebelPlayers) {
          if (otherRebel === rebel) continue;
          const otherUnits = this.getRebelUnitsInSector(sector2, otherRebel);
          if (otherUnits > rebelUnits) return false;
          if (otherUnits === rebelUnits && otherRebel.position < rebel.position) return false;
        }
        return rebelUnits > 0;
      }
    });
  }
  getMercsInSector(sector2, player) {
    const mercs = [];
    if (player.primarySquad?.sectorId === sector2.sectorId) {
      mercs.push(...player.primarySquad.getMercs());
    }
    if (player.secondarySquad?.sectorId === sector2.sectorId) {
      mercs.push(...player.secondarySquad.getMercs());
    }
    return mercs;
  }
  getDictatorMercsInSector(sector2) {
    if (!this.dictatorPlayer) return [];
    return this.dictatorPlayer.hiredMercs.filter(
      (m) => !m.isDead && m.sectorId === sector2.sectorId
    );
  }
  getDictatorUnitsInSector(sector2) {
    const militia = sector2.dictatorMilitia;
    const mercs = this.getDictatorMercsInSector(sector2).length;
    const dictatorCard = this.dictatorPlayer?.dictator;
    const dictatorInSector = dictatorCard?.inPlay && this.dictatorPlayer?.baseSectorId === sector2.sectorId ? 1 : 0;
    return militia + mercs + dictatorInSector;
  }
  getRebelUnitsInSector(sector2, player) {
    const militia = sector2.getRebelMilitia(`${player.position}`);
    const mercs = this.getMercsInSector(sector2, player).length;
    return militia + mercs;
  }
  getTotalRebelUnitsInSector(sector2) {
    let total = 0;
    for (const rebel of this.rebelPlayers) {
      total += this.getRebelUnitsInSector(sector2, rebel);
    }
    return total;
  }
  /**
   * Check if a player can see a sector's stash contents.
   * Per rules (01-game-elements-and-components.md): Stash contents are not public knowledge.
   * A player can only see stash if they have units in the sector.
   */
  canSeeStash(sector2, player) {
    if (player instanceof DictatorPlayer) {
      return this.getDictatorUnitsInSector(sector2) > 0;
    } else {
      const rebel = player;
      return this.getRebelUnitsInSector(sector2, rebel) > 0;
    }
  }
  /**
   * Get visible stash contents for a player.
   * Returns empty array if player cannot see the stash.
   */
  getVisibleStash(sector2, player) {
    if (this.canSeeStash(sector2, player)) {
      return [...sector2.stash];
    }
    return [];
  }
  // ==========================================================================
  // MERC-a2h: Coordinated Attack Management
  // ==========================================================================
  /**
   * Declare a coordinated attack on a target sector.
   * Squad will wait for other participants before executing the attack.
   */
  declareCoordinatedAttack(targetSectorId, playerId, squadType) {
    if (!this.pendingCoordinatedAttacks.has(targetSectorId)) {
      this.pendingCoordinatedAttacks.set(targetSectorId, []);
    }
    const attacks = this.pendingCoordinatedAttacks.get(targetSectorId);
    if (!attacks.some((a) => a.playerId === playerId && a.squadType === squadType)) {
      attacks.push({ playerId, squadType });
      this.message(`Squad declared coordinated attack on sector`);
    }
  }
  /**
   * Get pending coordinated attacks for a target sector.
   */
  getPendingCoordinatedAttack(targetSectorId) {
    return this.pendingCoordinatedAttacks.get(targetSectorId) || [];
  }
  /**
   * Clear pending coordinated attack for a target sector (after execution).
   */
  clearCoordinatedAttack(targetSectorId) {
    this.pendingCoordinatedAttacks.delete(targetSectorId);
  }
  /**
   * Check if a squad has a pending coordinated attack declared.
   */
  hasCoordinatedAttackDeclared(playerId, squadType) {
    for (const [sectorId, attacks] of this.pendingCoordinatedAttacks.entries()) {
      if (attacks.some((a) => a.playerId === playerId && a.squadType === squadType)) {
        return sectorId;
      }
    }
    return null;
  }
  /**
   * Cancel a squad's pending coordinated attack declaration.
   */
  cancelCoordinatedAttack(playerId, squadType) {
    for (const [sectorId, attacks] of this.pendingCoordinatedAttacks.entries()) {
      const index = attacks.findIndex((a) => a.playerId === playerId && a.squadType === squadType);
      if (index >= 0) {
        attacks.splice(index, 1);
        if (attacks.length === 0) {
          this.pendingCoordinatedAttacks.delete(sectorId);
        }
        break;
      }
    }
  }
  // ==========================================================================
  // Game State Queries
  // ==========================================================================
  isFinished() {
    if (this.dictatorPlayer?.isDefeated) {
      return true;
    }
    if (this.isBaseCaptured()) {
      return true;
    }
    if (this.dictatorPlayer?.tacticsDeck?.count(TacticsCard) === 0 && this.dictatorPlayer?.tacticsHand?.count(TacticsCard) === 0) {
      return true;
    }
    const aliveRebels = this.rebelPlayers.filter((r) => r.teamSize > 0 || r.canHireMerc(this));
    if (aliveRebels.length === 0 && this.rebelPlayers.length > 0) {
      return true;
    }
    if (this.isDayLimitReached()) {
      return true;
    }
    return false;
  }
  /**
   * Check if rebels have captured the dictator's base.
   * Base is captured when: base is revealed AND rebels control the sector
   * (no dictator militia/MERCs AND at least one rebel unit present)
   */
  isBaseCaptured() {
    if (!this.dictatorPlayer?.baseRevealed || !this.dictatorPlayer?.baseSectorId) {
      return false;
    }
    const baseSector = this.getSector(this.dictatorPlayer.baseSectorId);
    if (!baseSector) return false;
    const hasDictatorUnits = baseSector.dictatorMilitia > 0 || this.dictatorPlayer.dictator && !this.dictatorPlayer.dictator.isDead || this.getDictatorMercsInSector(baseSector).length > 0;
    if (hasDictatorUnits) return false;
    const hasRebelUnits = this.rebelPlayers.some((rebel) => {
      const hasSquad = rebel.primarySquad.sectorId === baseSector.sectorId || rebel.secondarySquad.sectorId === baseSector.sectorId;
      const hasMilitia = baseSector.getRebelMilitia(`${rebel.position}`) > 0;
      return hasSquad || hasMilitia;
    });
    return hasRebelUnits;
  }
  /**
   * Calculate victory points for each side based on controlled sector values.
   * Per rules (11-victory-and-game-end.md): Sum values of controlled sectors.
   * Neutral sectors (no units) don't count toward anyone's total.
   */
  calculateVictoryPoints() {
    let rebelPoints = 0;
    let dictatorPoints = 0;
    for (const sector2 of this.gameMap.getAllSectors()) {
      const dictatorUnits = this.getDictatorUnitsInSector(sector2);
      const totalRebelUnits = this.getTotalRebelUnitsInSector(sector2);
      if (dictatorUnits === 0 && totalRebelUnits === 0) continue;
      if (dictatorUnits >= totalRebelUnits) {
        dictatorPoints += sector2.value;
      } else {
        rebelPoints += sector2.value;
      }
    }
    return { rebelPoints, dictatorPoints };
  }
  getWinners() {
    if (!this.isFinished()) return [];
    if (this.dictatorPlayer?.isDefeated) {
      return [...this.rebelPlayers];
    }
    if (this.isBaseCaptured()) {
      return [...this.rebelPlayers];
    }
    if (this.dictatorPlayer?.tacticsDeck?.count(TacticsCard) === 0 && this.dictatorPlayer?.tacticsHand?.count(TacticsCard) === 0) {
      const { rebelPoints, dictatorPoints } = this.calculateVictoryPoints();
      this.message(`Final score - Rebels: ${rebelPoints}, Dictator: ${dictatorPoints}`);
      if (rebelPoints > dictatorPoints) {
        return [...this.rebelPlayers];
      } else {
        return [this.dictatorPlayer];
      }
    }
    return this.dictatorPlayer ? [this.dictatorPlayer] : [];
  }
  // ==========================================================================
  // Game Constants Helper Methods
  // ==========================================================================
  /**
   * Calculate reinforcement militia gained when Dictator discards a Tactics card
   * Formula: floor(Rebel Players / 2) + 1
   */
  getReinforcementAmount() {
    return getReinforcementAmount(this.rebelCount);
  }
  /**
   * Check if a dice roll is a hit (4+ on d6)
   */
  isHit(roll) {
    return roll >= CombatConstants.HIT_THRESHOLD;
  }
  /**
   * Roll a single d6
   */
  rollDie() {
    return Math.floor(Math.random() * CombatConstants.DICE_SIDES) + 1;
  }
  /**
   * Roll multiple dice and return results
   */
  rollDice(count) {
    const results = [];
    for (let i = 0; i < count; i++) {
      results.push(this.rollDie());
    }
    return results;
  }
  /**
   * Count hits from a set of dice results
   */
  countHits(rolls) {
    return rolls.filter((r) => this.isHit(r)).length;
  }
  /**
   * Check if game is in the setup day (Day 1 - The Landing)
   */
  isSetupDay() {
    return this.currentDay === GameDurationConstants.SETUP_DAY;
  }
  /**
   * Check if game is on the last day
   */
  isLastDay() {
    return this.currentDay >= GameDurationConstants.LAST_DAY;
  }
  /**
   * Get total game days
   */
  getTotalDays() {
    return GameDurationConstants.TOTAL_DAYS;
  }
  /**
   * Get remaining days in the game
   */
  getRemainingDays() {
    return Math.max(0, GameDurationConstants.LAST_DAY - this.currentDay);
  }
  // ==========================================================================
  // Day Management
  // ==========================================================================
  advanceDay() {
    this.currentDay++;
    for (const rebel of this.rebelPlayers) {
      for (const merc of rebel.team) {
        merc.resetActions();
        if (merc.mercId === "preaction" && merc.damage > 0) {
          const healed = merc.heal(1);
          if (healed > 0) {
            this.message(`Preaction auto-heals 1 health (${merc.health}/${merc.maxHealth})`);
          }
        }
      }
    }
    for (const merc of this.dictatorPlayer.hiredMercs) {
      merc.resetActions();
      if (merc.mercId === "preaction" && merc.damage > 0) {
        const healed = merc.heal(1);
        if (healed > 0) {
          this.message(`Preaction auto-heals 1 health (${merc.health}/${merc.maxHealth})`);
        }
      }
    }
    if (this.dictatorPlayer.dictator?.inPlay) {
      this.dictatorPlayer.dictator.actionsRemaining = 2;
    }
  }
  /**
   * Check if the game should end due to day limit
   */
  isDayLimitReached() {
    return this.currentDay > GameDurationConstants.LAST_DAY;
  }
};

// src/rules/index.ts
init_elements();
init_constants();
var gameDefinition = {
  gameClass: MERCGame,
  gameType: "MERC",
  displayName: "MERC",
  minPlayers: 2,
  // 1 Dictator + 1 Rebel
  maxPlayers: 7
  // 1 Dictator + 6 Rebels
};
export {
  AdjacencyConstants,
  CombatConstants,
  DictatorCard,
  DictatorConstants,
  DictatorPlayer,
  DiscardPile,
  Equipment,
  EquipmentDeck,
  ExpansionConstants,
  GameConstants,
  GameDurationConstants,
  GameMap,
  MERCGame,
  MercCard,
  MercConstants,
  MercDeck,
  Militia,
  PlayerArea,
  RebelPlayer,
  ReinforcementTable,
  Sector,
  SectorConstants,
  Squad,
  TacticsCard,
  TacticsDeck,
  TacticsHand,
  TeamConstants,
  TieBreakers,
  applyCastroTurnAbility,
  applyConscriptsEffect,
  applyDictatorSetupAbilities,
  applyDictatorSetupAbility,
  applyDictatorTurnAbilities,
  applyKimSetupAbility,
  applyKimTurnAbility,
  autoPlaceExtraMilitia,
  buildMap,
  calculateCombatOdds,
  canRetreat,
  createArmsDealerAction,
  createCombatContinueAction,
  createCombatRetreatAction,
  createCoordinatedAttackAction,
  createDeclareCoordinatedAttackAction,
  createDictatorEndMercActionsAction,
  createDictatorExploreAction,
  createDictatorMoveAction,
  createDictatorReEquipAction,
  createDictatorTrainAction,
  createEndTurnAction,
  createEquipStartingAction,
  createExecuteCoordinatedAttackAction,
  createExploreAction,
  createFireMercAction,
  createGameFlow,
  createHireMercAction,
  createHireStartingMercsAction,
  createHospitalAction,
  createJoinCoordinatedAttackAction,
  createMergeSquadsAction,
  createMoveAction,
  createMoveMilitiaAction,
  createPlaceLandingAction,
  createPlaceLandingDay1Action,
  createPlayTacticsAction,
  createReEquipAction,
  createReinforceAction,
  createSkipMilitiaMoveAction,
  createSplitSquadAction,
  createTrainAction,
  drawMercsForHiring,
  drawTacticsHand,
  equipStartingEquipment,
  executeCombat,
  executeCombatRetreat,
  executeDictatorDay1,
  executeTacticsEffect,
  gameDefinition,
  getCombatants,
  getDay1Summary,
  getMaxMilitiaPerSector,
  getMercsToDrawForHiring,
  getReinforcementAmount,
  getSetupConfiguration,
  getSetupSummary,
  getStartingMercCount,
  getTotalSectors,
  getUnoccupiedIndustries,
  getValidLandingSectors,
  getValidRetreatSectors,
  hasEnemies,
  hireDictatorMerc,
  hireSelectedMercs,
  isIndustryPosition,
  isRebelDay1Complete,
  isRebelPhaseComplete,
  isValidLandingSector,
  performSetup,
  placeExtraMilitia,
  placeInitialMilitia,
  placeLanding,
  registerAllActions,
  setupDictator,
  setupTacticsDeck,
  shuffleDecks,
  validateSetupConfig
};
