(function () {
  try {
    var savedTheme = localStorage.getItem('theme-mode');
    var lightDefaultApplied = localStorage.getItem('theme-light-default-v103') === '1';
    document.documentElement.setAttribute(
      'data-theme',
      savedTheme === 'dark' && lightDefaultApplied ? 'dark' : 'light'
    );
  } catch (_) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
