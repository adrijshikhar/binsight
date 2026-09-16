// jsdom has no Web Animations API; Base UI queries it when updating scroll areas.
if (!Element.prototype.getAnimations) {
  Element.prototype.getAnimations = () => []
}
