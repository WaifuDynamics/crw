package expo.modules.liquidglass

import android.content.Context
import android.os.Build
import android.view.ViewGroup
import com.qmdeve.liquidglass.widget.LiquidGlassView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.views.ExpoView

// Real liquid glass on Android, through AndroidLiquidGlassView: an AGSL shader that
// refracts and disperses what is behind the surface rather than only blurring it.
//
// The shader copies a view into a RenderNode and reads the copy. That view must therefore
// not contain the glass: point the glass at something it lives inside and the render tree
// becomes a loop, which the render thread pays for with a stack overflow. So the app marks
// what may be sampled - the screens - with a source view, and the dock, which floats above
// the screens rather than inside them, refracts that.
//
// The glass itself holds nothing: React Native draws the dock's icons above it.

private const val MIN_SDK_FOR_GLASS = Build.VERSION_CODES.TIRAMISU

/** The screens. Whatever is inside this view is what the glass may refract. */
class LiquidGlassSource(context: Context, appContext: AppContext) : ExpoView(context, appContext)

class LiquidGlassContainer(context: Context, appContext: AppContext) :
  ExpoView(context, appContext) {
  private val glass: LiquidGlassView? =
    if (Build.VERSION.SDK_INT >= MIN_SDK_FOR_GLASS) LiquidGlassView(context) else null
  private var sourceId: Int? = null

  init {
    glass?.let {
      it.layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
      it.setDraggableEnabled(false)
      it.setElasticEnabled(false)
      addView(it)
    }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    bindSource()
  }

  fun source(id: Int?) {
    sourceId = id
    bindSource()
  }

  private fun bindSource() {
    val glassView = glass ?: return
    val id = sourceId ?: return
    val source = appContext.findView<LiquidGlassSource>(id) ?: return
    // Refusing to sample a view we live inside is what keeps the render tree a tree.
    if (isInside(source)) return
    glassView.bind(source)
  }

  private fun isInside(source: ViewGroup): Boolean {
    var parent = this.parent
    while (parent != null) {
      if (parent === source) return true
      parent = (parent as? android.view.View)?.parent
    }
    return false
  }

  fun cornerRadius(value: Float) = glass?.setCornerRadius(dp(value))

  fun blurRadius(value: Float) = glass?.setBlurRadius(value)

  fun dispersion(value: Float) = glass?.setDispersion(value)

  fun refractionHeight(value: Float) = glass?.setRefractionHeight(dp(value))

  fun refractionOffset(value: Float) = glass?.setRefractionOffset(dp(value))

  fun tint(color: List<Double>) {
    val glassView = glass ?: return
    if (color.size < 4) return
    glassView.setTintColorRed(color[0].toFloat())
    glassView.setTintColorGreen(color[1].toFloat())
    glassView.setTintColorBlue(color[2].toFloat())
    glassView.setTintAlpha(color[3].toFloat())
  }

  private fun dp(value: Float) = value * resources.displayMetrics.density
}

class LiquidGlassModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CrwLiquidGlass")

    // The app falls back to its painted glass when the shader is not available.
    Constants("isAvailable" to (Build.VERSION.SDK_INT >= MIN_SDK_FOR_GLASS))

    View(LiquidGlassSource::class) { Name("CrwLiquidGlassSource") }

    View(LiquidGlassContainer::class) {
      Name("CrwLiquidGlassView")

      /** The node handle of the LiquidGlassSource whose contents to refract. */
      Prop("sourceId") { view: LiquidGlassContainer, value: Int? -> view.source(value) }
      // Sizes arrive in density-independent pixels, like every other style in the app.
      Prop("cornerRadius") { view: LiquidGlassContainer, value: Float -> view.cornerRadius(value) }
      Prop("blurRadius") { view: LiquidGlassContainer, value: Float -> view.blurRadius(value) }
      Prop("dispersion") { view: LiquidGlassContainer, value: Float -> view.dispersion(value) }
      Prop("refractionHeight") { view: LiquidGlassContainer, value: Float ->
        view.refractionHeight(value)
      }
      Prop("refractionOffset") { view: LiquidGlassContainer, value: Float ->
        view.refractionOffset(value)
      }
      /** Red, green, blue and alpha, each from 0 to 1. */
      Prop("tint") { view: LiquidGlassContainer, value: List<Double> -> view.tint(value) }
    }
  }
}
