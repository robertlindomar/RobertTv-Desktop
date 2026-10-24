document.addEventListener('click',event=>{const button=event.target.closest('[data-command]');if(button)window.robertDesktop.command(button.dataset.command);});
document.addEventListener('mouseenter',()=>window.robertDesktop.command('reveal'));
document.addEventListener('mouseleave',()=>window.robertDesktop.command('hide'));
window.robertDesktop.onReveal(show=>document.body.classList.toggle('revealed',show));
window.robertDesktop.onStatus(status=>{document.querySelector('nav').title=status.message||status.name;});
