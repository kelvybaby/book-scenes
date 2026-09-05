const sceneLines = [
  '“the most hidden bench in the little park”',
  '“pretending to read a book of verse in the shade of the almond trees”',
  '“sitting under the almond trees at the doorway”',
  '“under the shower of yellow leaves falling from the almond trees”',
] as const

const sceneThemes = [
  {
    name: 'Waiting',
    note: 'The concealed bench turns longing into a place and a duration.',
  },
  {
    name: 'Partial sight',
    note: 'Distance, foliage, and architecture allow each figure only in glimpses.',
  },
  {
    name: 'Correspondence',
    note: 'The book and telegraph wires make language part of the landscape.',
  },
  {
    name: 'Thresholds',
    note: 'Park and house, shade and light, attention and approach remain divided.',
  },
] as const

export function SceneContext() {
  return (
    <section className="scene-context" aria-labelledby="scene-context-title">
      <header className="scene-context__book">
        <p className="scene-context__eyebrow">A reader&apos;s scene from</p>
        <h1 id="scene-context-title">Love in the Time of Cholera</h1>
        <p className="scene-context__author">Gabriel García Márquez</p>
      </header>

      <div className="scene-context__relation">
        <p className="scene-context__label">How this scene relates</p>
        <p>
          <em>Under the Almond Trees</em> gathers several early moments into one
          memory tableau: Florentino waiting with his book in the park, Fermina
          embroidering at the doorway, and the charged distance before their
          correspondence. It is an emotional composite, not a claim that every
          detail occupied one literal instant.
        </p>
      </div>

      <figure className="scene-context__lines">
        <figcaption className="scene-context__label">Lines held in the scene</figcaption>
        <blockquote>
          {sceneLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </blockquote>
        <cite>Love in the Time of Cholera</cite>
      </figure>

      <div className="scene-context__themes">
        <p className="scene-context__label">Themes in this tableau</p>
        <dl>
          {sceneThemes.map((theme) => (
            <div key={theme.name}>
              <dt>{theme.name}</dt>
              <dd>{theme.note}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
