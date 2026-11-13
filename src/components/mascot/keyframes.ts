/**
 * Flow's animations: every keyframe and class the mascot's moods, taps and
 * walks use. Kept out of the component so the component reads as behaviour,
 * not three hundred lines of CSS; Mascot puts it in a <style> tag as before.
 */
export const MASCOT_KEYFRAMES = `
  @keyframes mascot-float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-4px); }
  }
  @keyframes mascot-rest {
    0%, 25%, 50%, 75%, 100% { transform: translateY(0) scale(1) rotate(0deg); }
    12.5% { transform: translateY(1.5px) scaleY(0.98); }
    37.5% { transform: translateX(-3px) translateY(-1px) rotate(-1.5deg); }
    62.5% { transform: translateY(1px) scaleX(0.99); }
    87.5% { transform: translateY(-2.5px) scaleY(1.02) rotate(2deg); }
  }
  @keyframes mascot-bath {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    50% { transform: translateY(1.5px) rotate(1deg) scale(1.02, 0.98); }
  }
  @keyframes mascot-happy {
    0%, 100% { transform: translateY(0) scale(1); }
    40% { transform: translateY(-6px) scale(0.95, 1.05); }
    50% { transform: translateY(-7px) scale(0.92, 1.08); }
    60% { transform: translateY(-5px) scale(1.05, 0.95); }
  }
  @keyframes mascot-excited {
    0% { transform: translateY(0) scale(1) rotate(0deg); }
    20% { transform: translateY(-12px) scale(0.95, 1.05) rotate(0deg); }
    45% { transform: translateY(0) scale(1.1, 0.9) rotate(180deg); }
    70% { transform: translateY(-6px) scale(0.98, 1.02) rotate(360deg); }
    100% { transform: translateY(0) scale(1) rotate(360deg); }
  }
  @keyframes mascot-think {
    0%, 100% { transform: rotate(0deg) translateY(0); }
    25% { transform: rotate(-3deg) translateY(-1px); }
    75% { transform: rotate(3deg) translateY(-2px); }
  }
  @keyframes mascot-worried {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    50% { transform: translateY(-2px) rotate(-1.5deg); }
  }
  @keyframes mascot-angry {
    0%, 100% { transform: translate(0, 0) rotate(0deg); }
    15%, 55%, 95% { transform: translate(-2px, 0.5px) rotate(-2deg); }
    35%, 75% { transform: translate(2px, -0.5px) rotate(2deg); }
  }
  @keyframes mascot-panic {
    0%, 100% { transform: translate(0, 0) scale(1); }
    10%, 30%, 50%, 70%, 90% { transform: translate(-3px, 1px) scale(1.03); }
    20%, 40%, 60%, 80% { transform: translate(3px, -1px) scale(0.97); }
  }
  @keyframes eye-blink {
    0%, 95%, 100% { transform: scaleY(1); }
    97.5% { transform: scaleY(0.1); }
  }
  @keyframes float-symbol {
    0%, 100% { transform: translateY(0) scale(0.9); opacity: 0.3; }
    50% { transform: translateY(-8px) scale(1.15); opacity: 0.95; }
  }
  @keyframes bounce-subtle {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-2px); }
  }
  @keyframes confetti-particle {
    0% { transform: scale(1) translateY(0) rotate(0); opacity: 1; }
    100% { transform: scale(0.4) translateY(45px) rotate(240deg); opacity: 0; }
  }
  @keyframes float-reward {
    0% { transform: translate(-50%, 0); opacity: 0; }
    20% { transform: translate(-50%, -12px); opacity: 1; }
    100% { transform: translate(-50%, -40px); opacity: 0; }
  }
  @keyframes mouth-talk {
    0% { transform: scaleY(0.2); }
    100% { transform: scaleY(1.4); }
  }
  @keyframes float-zzz {
    0% { transform: translate(0, 0) scale(0.6); opacity: 0; }
    20% { opacity: 0.8; }
    100% { transform: translate(-12px, -24px) scale(1.1); opacity: 0; }
  }
  @keyframes shatter-left {
    100% { transform: translate(-8px, 6px) rotate(-35deg); opacity: 0; }
  }
  @keyframes shatter-right {
    100% { transform: translate(8px, 6px) rotate(35deg); opacity: 0; }
  }
  @keyframes shower-stream {
    0% { stroke-dasharray: 2 15; stroke-dashoffset: 0; }
    100% { stroke-dasharray: 6 12; stroke-dashoffset: -30; }
  }
  @keyframes soap-bubble {
    0%, 100% { transform: scale(1) translate(0, 0); }
    50% { transform: scale(1.15) translate(1px, -1px); }
  }
  @keyframes bubble-float-up {
    0% { transform: translateY(30px) scale(0.5); opacity: 0; }
    30% { opacity: 0.8; }
    100% { transform: translateY(-20px) scale(1.2); opacity: 0; }
  }
  /*
   * He leaves the screen. He does not fade into the distance.
   *
   * This used to shrink him to half size, blur him and dim him while
   * nudging him a little way sideways, so an errand looked like the
   * mascot sinking backwards into the wallpaper - and the z-index was
   * dropped to 0 underneath, which put him behind the app while it
   * happened.
   *
   * The soccer ball already had the exit worth copying: full size, full
   * brightness, one hard shove past the edge, gone. Same distance here
   * (-320% of a 56px mascot is the ball's -180px), same feeling. What is
   * left is the pause - the stretch where nothing is on screen at all is
   * what sells him being somewhere else.
   */
  @keyframes walk-off-left {
    0% { transform: translateX(0) scale(1, 1); }
    6% { transform: translateX(14%) scale(1, 1); }
    24%, 68% { transform: translateX(-320%) rotate(-6deg) scale(1, 1); }
    86% { transform: translateX(6%) scale(-1, 1); }
    94% { transform: translateX(0) scale(-1, 1); }
    100% { transform: translateX(0) scale(1, 1); }
  }
  @keyframes walk-off-right {
    0% { transform: translateX(0) scale(-1, 1); }
    6% { transform: translateX(-14%) scale(-1, 1); }
    24%, 68% { transform: translateX(320%) rotate(6deg) scale(-1, 1); }
    86% { transform: translateX(-6%) scale(1, 1); }
    94% { transform: translateX(0) scale(1, 1); }
    100% { transform: translateX(0) scale(1, 1); }
  }
  @keyframes soccer-ball-timeline {
    /* 0% to 56.8%: Bouncing on head */
    0%, 14.2%, 28.4%, 42.6%, 56.8% { transform: translate(0, 0); }
    7.1%, 21.3%, 35.5%, 49.7% { transform: translate(0, -18px); }
    
    /* 56.8% to 64.3% (4.0s to 4.5s): Falls next to him on ground */
    64.3% { transform: translate(-26px, 38px) rotate(-180deg); }
    
    /* 64.3% to 80% (4.5s to 5.6s): Rest on floor */
    80% { transform: translate(-26px, 38px) rotate(-180deg); }
    
    /* 80% to 83% (5.6s to 5.8s): Hit by Mascot's body kick */
    83% { transform: translate(-24px, 36px) rotate(-160deg); }
    
    /* 83% to 94.3% (5.8s to 6.6s): Flies off screen fast to the left */
    94.3%, 100% { transform: translate(-180px, -20px) rotate(-720deg); }
  }
  @keyframes mascot-soccer-kick {
    /* 0% to 56.8%: body bounce */
    0%, 14.2%, 28.4%, 42.6%, 56.8% { transform: translateY(0) scaleY(1); }
    7.1%, 21.3%, 35.5%, 49.7% { transform: translateY(1.5px) scaleY(0.97); }
    
    /* 56.8% to 80%: normal standing, looking down */
    80% { transform: translate(0, 0) rotate(0deg); }
    
    /* 80% to 83% (5.6s to 5.8s): lean/kick to the left! */
    83% { transform: translate(-5px, 2px) rotate(-12deg); }
    
    /* 83% to 87% (5.8s to 6.1s): recoil after kick */
    87% { transform: translate(3px, -1px) rotate(6deg); }
    
    /* 87% to 100%: recover */
    95%, 100% { transform: translate(0, 0) rotate(0deg); }
  }
  @keyframes phone-glow {
    0% { filter: drop-shadow(0 0 1px rgba(56, 189, 248, 0.4)); }
    100% { filter: drop-shadow(0 0 6px rgba(56, 189, 248, 0.95)); }
  }
  @keyframes drinking-tilt {
    0%, 100% { transform: rotate(0deg); }
    50% { transform: rotate(-15deg) translateY(-1px); }
  }
  @keyframes clock-vibrate {
    0%, 100% { transform: rotate(0deg) translate(0, 0); }
    25% { transform: rotate(-8deg) translate(-0.5px, -0.5px); }
    75% { transform: rotate(8deg) translate(0.5px, 0.5px); }
  }
  @keyframes book-float {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    50% { transform: translateY(-1.5px) rotate(1.5deg); }
  }
  @keyframes float-note {
    0% { transform: translateY(0) scale(0.7); opacity: 0; }
    30% { opacity: 1; }
    100% { transform: translateY(-12px) scale(1.1); opacity: 0; }
  }
  @keyframes mascot-heading {
    0%, 100% { transform: translateY(0) scaleY(1); }
    50% { transform: translateY(-2.5px) scaleY(1.04); }
  }
  /* ease-out on the way through, so the shove off the edge is fast and
     the return settles rather than skidding. */
  .animate-walk-left { animation: walk-off-left 5s ease-out forwards; }
  .animate-walk-right { animation: walk-off-right 5s ease-out forwards; }
  .animate-zzz-1 { animation: float-zzz 3s ease-in-out infinite; animation-delay: 0s; }
  .animate-zzz-2 { animation: float-zzz 3s ease-in-out infinite; animation-delay: 1s; }
  .animate-zzz-3 { animation: float-zzz 3s ease-in-out infinite; animation-delay: 2s; }
  
  .mascot-float-anim { animation: mascot-float 3s ease-in-out infinite; }
  .mascot-rest-anim { animation: mascot-rest 10s ease-in-out infinite; }
  .mascot-bath-anim { animation: mascot-bath 1.5s ease-in-out infinite alternate; }
  .mascot-happy-anim { animation: mascot-happy 1.2s ease-in-out infinite; }
  .mascot-excited-anim { animation: mascot-excited 1.4s cubic-bezier(0.25, 1, 0.5, 1) infinite; }
  .mascot-think-anim { animation: mascot-think 2s ease-in-out infinite; }
  .mascot-worried-anim { animation: mascot-worried 3.5s ease-in-out infinite; }
  .mascot-angry-anim { animation: mascot-angry 1.5s ease-in-out infinite; }
  .mascot-panic-anim { animation: mascot-panic 0.8s ease-in-out infinite; }
  
  .animate-bounce-subtle { animation: bounce-subtle 2.5s ease-in-out infinite; }
  .animate-confetti-particle { animation: confetti-particle 1.2s cubic-bezier(0.1, 0.8, 0.3, 1) forwards; }
  .animate-float-reward { animation: float-reward 1.5s ease-out forwards; }
  .animate-shower-stream { animation: shower-stream 0.3s linear infinite; }
  .animate-soap-bubble { transform-origin: center; animation: soap-bubble 1s ease-in-out infinite alternate; }
  .animate-bubble-float-1 { transform-origin: 12px 18px; animation: bubble-float-up 2.2s ease-in infinite; }
  .animate-bubble-float-2 { transform-origin: 52px 20px; animation: bubble-float-up 1.8s ease-in infinite; animation-delay: 0.5s; }
  .animate-bubble-float-3 { transform-origin: 32px 16px; animation: bubble-float-up 2s ease-in infinite; animation-delay: 1.1s; }
  
  .glow-gold { filter: drop-shadow(0 0 6px rgba(234, 179, 8, 0.45)); }
  .glow-excited { filter: drop-shadow(0 0 12px rgba(234, 179, 8, 0.8)); }
  .glow-worried { filter: drop-shadow(0 0 8px rgba(245, 158, 11, 0.5)); }
  .glow-angry { filter: drop-shadow(0 0 8px rgba(239, 68, 68, 0.6)); }
  .glow-panic { filter: drop-shadow(0 0 10px rgba(239, 68, 68, 0.85)); }
  .glow-sleep { filter: drop-shadow(0 0 5px rgba(99, 102, 241, 0.25)); }
  
  .dodge-left { transform: translateX(-35px) rotate(-15deg) scale(0.95) !important; transition: transform 0.15s ease-out; }
  .dodge-right { transform: translateX(35px) rotate(15deg) scale(0.95) !important; transition: transform 0.15s ease-out; }
  .dodge-spin { transform: rotate(360deg) scale(1.1) !important; transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
  .dodge-hide { transform: translateY(45px) scale(0) !important; opacity: 0 !important; transition: all 0.3s ease-out; }
  
  @keyframes breath-rise {
    0% { transform: translate(0, 0) scale(0.5); opacity: 0; }
    15% { opacity: 0.8; }
    100% { transform: translate(15px, -25px) scale(1.5); opacity: 0; }
  }
  @keyframes flash-animation {
    0% { opacity: 1; }
    100% { opacity: 0; }
  }
  @keyframes polaroid-slide {
    0% { transform: translate(-50%, -20px) scale(0.5); opacity: 0; }
    15% { transform: translate(-50%, 0) scale(1) rotate(3deg); opacity: 1; }
    85% { transform: translate(-50%, 0) scale(1) rotate(3deg); opacity: 1; }
    100% { transform: translate(-50%, 30px) scale(0.8) rotate(3deg); opacity: 0; }
  }
  .animate-flash { animation: flash-animation 0.2s ease-out forwards; }
  @keyframes note-flick {
    0% { transform: rotate(0deg) translateY(0); }
    100% { transform: rotate(-15deg) translateY(-3px); }
  }
  @keyframes counting-cash-flick {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-1.5px); }
  }
  @keyframes shelf-peek {
    0% { transform: rotate(0deg) translateX(0); }
    100% { transform: rotate(4deg) translateX(1px); }
  }
  @keyframes rain-fall {
    0% { transform: translateY(0); opacity: 0; }
    30% { opacity: 0.8; }
    100% { transform: translateY(12px); opacity: 0; }
  }
  @keyframes umbrella-sway {
    0%, 100% { transform: rotate(-3deg); }
    50% { transform: rotate(3deg); }
  }
  @keyframes fistpump {
    0% { transform: translateY(8px) scale(0.85); }
    40% { transform: translateY(-4px) scale(1.1); }
    100% { transform: translateY(0) scale(1); }
  }
  @keyframes ears-perk {
    0% { transform: scale(1) rotate(0deg); }
    100% { transform: scale(1.15) rotate(5deg); }
  }
  @keyframes bell-shake {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(-12deg); }
    75% { transform: rotate(12deg); }
  }
  @keyframes mascot-yawn {
    0%, 100% { transform: scale(1) translateY(0); }
    50% { transform: scale(1.06, 1.12) translateY(-2px); }
  }
  @keyframes trophy-lift {
    0%, 100% { transform: translateY(0) scale(1); }
    50% { transform: translateY(-3px) scale(1.05); }
  }
  @keyframes refund-wince-anim {
    0% { transform: scale(1) rotate(0deg); }
    30% { transform: scale(0.92) rotate(-5deg) translateY(2px); }
    100% { transform: scale(1) rotate(0deg); }
  }
  @keyframes staff-wave-arm {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(-20deg); }
  }
  @keyframes mascot-low-stock {
    0%, 100% { transform: rotate(0deg) translateY(0); }
    50% { transform: rotate(4deg) translateY(1px); }
  }
  .mascot-low-stock-anim { animation: mascot-low-stock 1.5s ease-in-out infinite alternate; }
  .mascot-yawn-anim { animation: mascot-yawn 2s ease-in-out infinite; }
`;
