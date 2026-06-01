// Eixos estratégicos do IDR-Paraná e Objetivos de Desenvolvimento Sustentável
// (ODS/ONU). Listas fechadas usadas nos grupos de checkboxes do formulário e
// validadas no backend.

export const EIXOS_ESTRATEGICOS = [
  'Competitividade e renda',
  'Segurança alimentar e nutricional',
  'Promoção social e cidadania',
  'Sustentabilidade ambiental',
] as const;

export type EixoEstrategico = (typeof EIXOS_ESTRATEGICOS)[number];

export const ODS = [
  '1. Erradicação da pobreza',
  '2. Fome zero e agricultura sustentável',
  '3. Saúde e bem-estar',
  '4. Educação de qualidade',
  '5. Igualdade de gênero',
  '6. Água potável e saneamento',
  '7. Energia limpa e acessível',
  '8. Trabalho decente e crescimento econômico',
  '9. Indústria, inovação e infraestrutura',
  '10. Redução das desigualdades',
  '11. Cidades e comunidades sustentáveis',
  '12. Consumo e produção sustentáveis',
  '13. Ação contra a mudança global do clima',
  '14. Vida na água',
  '15. Vida terrestre',
  '16. Paz, justiça e instituições eficazes',
  '17. Parcerias e meios de implementação',
] as const;

export type Ods = (typeof ODS)[number];
