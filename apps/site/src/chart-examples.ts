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
    name: 'image-units',
    images: { badge },
    spec: {
      width: 560, height: 260, title: 'Badges by team',
      series: [{ type: 'units', name: 'Badges', display: 'rows',
        data: [{ name: 'Design', value: 6, symbol: { image: 'badge' } },
          { name: 'Build', value: 9, symbol: { image: 'badge' } },
          { name: 'Test', value: 4, symbol: { image: 'badge' } }] }],
    },
  },
  {
    name: 'image-pictorial-bar',
    images: { badge },
    spec: {
      width: 640, height: 340, title: 'Badges a month',
      axes: { x: { type: 'band', categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] },
        y: { type: 'linear', min: 0, max: 10 } },
      series: [{ type: 'bar', name: 'Badges', shape: 'pictorial', symbol: { image: 'badge' },
        data: [3, 5, 4, 6, 7, 9, 8, 6, 5, 7, 8, 10] }],
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
