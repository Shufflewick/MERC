<script setup lang="ts">
import { UI_COLORS } from '../colors';

interface EquipmentItem {
  equipmentName?: string;
  equipmentType?: string;
  description?: string;
  combatBonus?: number;
  initiative?: number;
  training?: number;
  armorBonus?: number;
  targets?: number;
  negatesArmor?: boolean;
  image?: string;
  attributes?: Record<string, any>;
  _parsedName?: string;
  _parsedType?: string;
}

const props = defineProps<{
  items: EquipmentItem[];
  clickable?: boolean;
  title?: string;
}>();

const emit = defineEmits<{
  (e: 'select', item: EquipmentItem): void;
}>();

// Helper to get attribute from node
function getAttr<T>(node: any, key: string, defaultVal: T): T {
  if (node?.attributes && node.attributes[key] !== undefined) return node.attributes[key];
  if (node && node[key] !== undefined) return node[key];
  return defaultVal;
}

// Get equipment image path
function getEquipmentImagePath(equip: EquipmentItem): string {
  const image = getAttr(equip, 'image', '');
  if (image) return image;

  const equipId = getAttr(equip, 'equipmentId', '');
  if (equipId) return `/equipment/${equipId}.png`;

  // Fallback: derive from name - equipment files use lowercase with spaces
  const name = getEquipmentName(equip);
  if (name && name !== 'Unknown' && name !== 'Done') {
    // Try exact lowercase match first (e.g., "Ghillie Suit" -> "ghillie suit.png")
    const filename = name.toLowerCase();
    return `/equipment/${filename}.png`;
  }

  return '/equipment/unknown.png';
}

// Get equipment name
function getEquipmentName(equip: EquipmentItem): string {
  // Use parsed name if available (from "Name (Type)" format)
  if (equip._parsedName) return equip._parsedName;
  return getAttr(equip, 'equipmentName', '') ||
         getAttr(equip, 'name', '') ||
         'Unknown';
}

// Get equipment type
function getEquipmentType(equip: EquipmentItem): string {
  // Use parsed type if available
  if (equip._parsedType) return equip._parsedType;
  return getAttr(equip, 'equipmentType', '') || getAttr(equip, 'type', '');
}

// Get equipment description
function getEquipmentDescription(equip: EquipmentItem): string {
  return getAttr(equip, 'description', '') || '';
}

// Format equipment stat bonuses as a string
function getEquipmentStats(equip: EquipmentItem): string {
  const stats: string[] = [];

  const combat = getAttr(equip, 'combatBonus', 0);
  if (combat !== 0) {
    stats.push(`Combat ${combat > 0 ? '+' : ''}${combat}`);
  }

  const initiative = getAttr(equip, 'initiative', 0);
  if (initiative !== 0) {
    stats.push(`Init ${initiative > 0 ? '+' : ''}${initiative}`);
  }

  const training = getAttr(equip, 'training', 0);
  if (training !== 0) {
    stats.push(`Training ${training > 0 ? '+' : ''}${training}`);
  }

  const armor = getAttr(equip, 'armorBonus', 0);
  if (armor !== 0) {
    stats.push(`Armor ${armor > 0 ? '+' : ''}${armor}`);
  }

  const targets = getAttr(equip, 'targets', 0);
  if (targets > 1) {
    stats.push(`${targets} targets`);
  }

  const negatesArmor = getAttr(equip, 'negatesArmor', false);
  if (negatesArmor) {
    stats.push('Ignores armor');
  }

  return stats.join(' • ');
}

// Get CSS class for equipment type badge
function getEquipmentTypeClass(equip: EquipmentItem): string {
  const type = getEquipmentType(equip).toLowerCase();
  if (type === 'weapon') return 'type-weapon';
  if (type === 'armor') return 'type-armor';
  if (type === 'accessory') return 'type-accessory';
  return '';
}

function handleClick(item: EquipmentItem) {
  if (props.clickable) {
    emit('select', item);
  }
}
</script>

<template>
  <div class="equipment-table-container">
    <h3 v-if="title" class="table-title">{{ title }}</h3>
    <div class="equipment-table-wrapper">
      <table class="equipment-table">
        <tbody>
          <tr
            v-for="(item, index) in items"
            :key="getAttr(item, 'id', '') || index"
            class="equipment-row"
            :class="{ clickable: clickable }"
            @click="handleClick(item)"
          >
            <td class="equip-image-cell">
              <div class="equip-image-wrapper">
                <img
                  :src="getEquipmentImagePath(item)"
                  :alt="getEquipmentName(item)"
                  class="equip-image"
                  @error="($event.target as HTMLImageElement).src = '/equipment/unknown.png'"
                />
              </div>
            </td>
            <td class="equip-name-cell">
              <div class="equip-name-content">
                <span class="equip-type-badge" :class="getEquipmentTypeClass(item)">
                  {{ getEquipmentType(item) }}
                </span>
                <span class="equip-name">{{ getEquipmentName(item) }}</span>
              </div>
            </td>
            <td class="equip-desc-cell">
              <div class="equip-stats" v-if="getEquipmentStats(item)">
                {{ getEquipmentStats(item) }}
              </div>
              <span class="equip-description" v-if="getEquipmentDescription(item)">
                {{ getEquipmentDescription(item) }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="items.length === 0" class="empty-message">No equipment</div>
  </div>
</template>

<style scoped>
.equipment-table-container {
  width: 100%;
}

.table-title {
  margin: 0 0 12px;
  font-size: 1.1rem;
  color: v-bind('UI_COLORS.textPrimary');
  border-bottom: 1px solid v-bind('UI_COLORS.border');
  padding-bottom: 8px;
}

.equipment-table-wrapper {
  max-height: 400px;
  overflow-y: auto;
}

.equipment-table {
  width: 100%;
  border-collapse: collapse;
}

.equipment-row {
  border-bottom: 1px solid v-bind('UI_COLORS.border');
  transition: background 0.2s;
}

.equipment-row.clickable {
  cursor: pointer;
}

.equipment-row.clickable:hover {
  background: rgba(212, 168, 75, 0.15);
}

.equipment-row:last-child {
  border-bottom: none;
}

.equip-image-cell {
  width: 60px;
  padding: 8px;
}

.equip-image-wrapper {
  width: 50px;
  height: 50px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.equip-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.equip-name-cell {
  padding: 8px 12px;
  vertical-align: middle;
}

.equip-name-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.equip-type-badge {
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 2px 6px;
  border-radius: 3px;
  width: fit-content;
}

.equip-type-badge.type-weapon {
  background: rgba(255, 107, 138, 0.3);
  color: #ff6b8a;
}

.equip-type-badge.type-armor {
  background: rgba(100, 181, 246, 0.3);
  color: #64b5f6;
}

.equip-type-badge.type-accessory {
  background: rgba(129, 212, 168, 0.3);
  color: #81d4a8;
}

.equip-name {
  font-weight: 600;
  color: #fff;
  font-size: 0.95rem;
}

.equip-desc-cell {
  padding: 8px 12px;
  vertical-align: middle;
  max-width: 300px;
}

.equip-stats {
  font-size: 0.85rem;
  font-weight: 600;
  color: v-bind('UI_COLORS.accent');
  margin-bottom: 4px;
}

.equip-description {
  font-size: 0.8rem;
  color: v-bind('UI_COLORS.textSecondary');
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.empty-message {
  color: v-bind('UI_COLORS.textSecondary');
  font-style: italic;
  padding: 20px;
  text-align: center;
}
</style>
