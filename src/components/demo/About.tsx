export default function About() {
  return (
    <div className="about">
      <h2>One brief. One plugin. This robot.</h2>
      <p>
        Everything in this workspace — the stack, the map, the running sim —
        was built by Claude Code with the{' '}
        <a href="https://github.com/jazarium/robium-plugin">robium</a> plugin, from
        this brief (verbatim from the{' '}
        <a href="https://github.com/jazarium/robium-applications">robium-applications</a>{' '}
        proving ground):
      </p>
      <pre>{`Autonomous mobile-robot navigation in simulation
(expected: ROS 2 + Nav2 + Gazebo, dockerized, live viz)

pass bar: robot navigates to goals in sim;
smoke test passes; skills visibly drove the stack decisions`}</pre>
      <p>
        The agent chose the stack, wrote the architecture brief, built the
        Docker environment, ran SLAM to produce the map you can drive on, tuned
        Nav2 around real gotchas, and gated it behind a smoke test. Browse the
        files, open a terminal, edit a config — it's all live and yours for the
        session.
      </p>
      <a className="btn" href="/">Get the plugin →</a>
    </div>
  );
}
