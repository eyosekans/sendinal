<script setup lang="ts">
import CampaignBuilder from '~/components/campaigns/CampaignBuilder.vue'

// Full-screen builder — no app sidebar shell.
definePageMeta({ layout: false })
useHead({ title: 'New Campaign — Sendinal' })

const route = useRoute()
const templateId = (route.query.template as string) || null
</script>

<template>
  <CampaignBuilder :template-id="templateId" />
</template>
