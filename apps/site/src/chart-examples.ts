import type { ChartSpec } from '@borrowdale/charts';

export type ChartExample = {
  name: string;
  spec: ChartSpec;
  images?: Record<string, string>;
};

// A bundled 32 × 32 PNG badge; examples never fetch external image URLs.
const badge = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAiElEQVR4nO3OyxGAIAxF0TRjHbq3Z4uyARwWzDAKIR8gOmbxtu8eOI8tWA4c4ADtwbKvPwbEeNp0QB7XIESAUlyKYAOwuATBAlDiXMR3AJw4B0ECSOJURBOgiVMQKKBHvIWoAnrGMcQ7ASPiNcQDMDJeQsDs+B0BFvEcAVbxNHuAZdwBDnBA3AUetBJokrmwhgAAAABJRU5ErkJggg==';

export const presentationExamples: ChartExample[] = [
  {
    name: 'image-markers',
    images: { badge },
    spec: {
      width: 640, height: 400, title: 'Image markers',
      axes: { x: { type: 'linear', min: 0, max: 4 }, y: { type: 'linear', min: 0, max: 10 } },
      series: [{ type: 'bubble', name: 'Milestones',
        data: [[1, 3, 400], [2, 7, 650], [3, 5, 500]], symbol: { image: 'badge' } }],
    },
  },
  {
    name: 'data-labels',
    spec: {
      width: 640, height: 400, title: 'Data labels',
      axes: { x: { type: 'band', categories: ['Spring', 'Summer', 'Autumn', 'Winter'] },
        y: { type: 'linear', min: 0, max: 30 } },
      series: [{ type: 'bar', name: 'Orders', data: [12, 24, 18, 9], dataLabels: true }],
    },
  },
];
