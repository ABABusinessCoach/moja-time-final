@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html {
    font-family: 'Quicksand', sans-serif;
    -webkit-tap-highlight-color: transparent;
  }

  body {
    @apply antialiased;
    color: #355574;
    background-color: #f9f9f9;
  }
}

@layer utilities {
  .touch-manipulation {
    touch-action: manipulation;
  }
}

@keyframes slide-in {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes fade-in {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

.animate-slide-in {
  animation: slide-in 0.3s ease-out;
}

.animate-fade-in {
  animation: fade-in 0.2s ease-out;
}
