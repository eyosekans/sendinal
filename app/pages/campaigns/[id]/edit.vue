<script setup lang="ts">
import CampaignBuilder from '~/components/campaigns/CampaignBuilder.vue'

// Full-screen builder — no app sidebar shell.
definePageMeta({ layout: false })
useHead({ title: 'Edit Campaign — Sendinal' })

const route = useRoute()
const id = route.params.id as string
</script>

<template>
  <CampaignBuilder :campaign-id="id" />
</template>
