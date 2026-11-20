<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
const props = defineProps({ closeOnBackdrop: Boolean, titleId: { type: String, default: 'detail-title' }, closeLabel: { type: String, default: '关闭详情 ✕' } })
const emit = defineEmits(['close'])
const dialog = ref(null)
function backdropClick(event) {
  if (!props.closeOnBackdrop || event.target !== dialog.value) return
  const { left, right, top, bottom } = dialog.value.getBoundingClientRect()
  if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) emit('close')
}
let previous
onMounted(() => { previous = document.activeElement; dialog.value.showModal() })
onUnmounted(() => previous?.focus())
</script>
<template><dialog ref="dialog" class="detail-dialog" :aria-labelledby="titleId" @click="backdropClick" @cancel.prevent="emit('close')"><button class="drawer-close" autofocus @click="emit('close')">{{ closeLabel }}</button><slot /></dialog></template>
