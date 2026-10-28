import { Dot, Res } from '../AmpSchematic';
import { Cap, Ground } from '../FilterSchematic';
import { Derive, Eq, Example, F, M, x } from './notation';
import { Diode, Motor, Nmos, Npn, Rail } from './symbols';

// Fundamentos: transistores bipolares (BJT) y MOSFET, como llave y como
// amplificador, con tres ejemplos de circuitos.

function LedSwitchSchematic() {
  return (
    <svg className="schematic th-sch" viewBox="0 0 230 215" role="img" aria-label="NPN como llave de un LED">
      <Rail x={150} y={22} label="+5 V" />
      <Res x1={150} y1={22} x2={150} y2={70} />
      <Diode a={[150, 70]} c={[150, 116]} led />
      <Npn x={116} y={150} />
      <Ground x={150} y={184} />
      <text className="sch-label" x={4} y={155}>
        µC
      </text>
      <path d="M30 150H44" />
      <Res x1={44} y1={150} x2={116} y2={150} />
      <text className="sch-value" x={162} y={50}>
        RC 150 Ω
      </text>
      <text className="sch-value" x={176} y={98}>
        LED
      </text>
      <text className="sch-value" x={80} y={138} textAnchor="middle">
        RB 2,7 kΩ
      </text>
    </svg>
  );
}

function MotorSwitchSchematic() {
  return (
    <svg className="schematic th-sch" viewBox="0 0 250 220" role="img" aria-label="MOSFET como llave de un motor">
      <Rail x={160} y={22} label="+5 V" />
      <path d="M160 22V48M160 76V116M160 36H210V50M160 96H210V86" />
      <Motor x={160} y={62} />
      <Diode a={[210, 86]} c={[210, 50]} />
      <Dot x={160} y={36} />
      <Dot x={160} y={96} />
      <Nmos x={126} y={150} />
      <Ground x={160} y={184} />
      <text className="sch-label" x={4} y={155}>
        µC
      </text>
      <path d="M30 150H40M100 150H126" />
      <Res x1={40} y1={150} x2={100} y2={150} />
      <Dot x={112} y={150} />
      <Res x1={112} y1={150} x2={112} y2={196} />
      <Ground x={112} y={196} />
      <text className="sch-value" x={70} y={138} textAnchor="middle">
        100 Ω
      </text>
      <text className="sch-value" x={104} y={180} textAnchor="end">
        100 kΩ
      </text>
      <text className="sch-value" x={220} y={72}>
        D
      </text>
    </svg>
  );
}

function CommonEmitterSchematic() {
  return (
    <svg className="schematic th-sch" viewBox="0 0 250 240" role="img" aria-label="Amplificador de emisor común">
      <text className="sch-value" x={4} y={20}>
        +12 V
      </text>
      <path d="M46 16H144M90 16V20M144 16V20" />
      <Res x1={90} y1={20} x2={90} y2={110} />
      <Dot x={90} y={130} />
      <path d="M90 110V130H110" />
      <Res x1={90} y1={130} x2={90} y2={200} />
      <Ground x={90} y={200} />
      <text className="sch-label" x={4} y={135}>
        vi
      </text>
      <Cap x1={22} y1={130} x2={74} y2={130} />
      <path d="M74 130H90" />
      <Npn x={110} y={130} />
      <Res x1={144} y1={20} x2={144} y2={82} />
      <path d="M144 82V96" />
      <Dot x={144} y={88} />
      <path d="M144 88H200" />
      <text className="sch-label" x={206} y={93}>
        vo
      </text>
      <Res x1={144} y1={164} x2={144} y2={210} />
      <Ground x={144} y={210} />
      <text className="sch-value" x={82} y={70} textAnchor="end">
        R1 47 kΩ
      </text>
      <text className="sch-value" x={82} y={170} textAnchor="end">
        R2 10 kΩ
      </text>
      <text className="sch-value" x={156} y={56}>
        RC 4,7 kΩ
      </text>
      <text className="sch-value" x={156} y={192}>
        RE 1 kΩ
      </text>
    </svg>
  );
}

export function TransistorSection() {
  return (
    <section className="panel th-section" id="tr">
      <h2>Transistores</h2>
      <p>
        Un transistor tiene tres terminales: con una corriente o tensión chica en uno se controla una corriente grande
        entre los otros dos. Se usa de dos maneras: como <strong>llave</strong> (todo o nada, para prender un LED, un
        motor, un relé) y como <strong>amplificador</strong> (la salida sigue proporcionalmente a la entrada). Los op-amps
        y los amplificadores de instrumentación están hechos de transistores: su entrada es un <em>par diferencial</em>,
        dos transistores con los emisores (o las fuentes) unidos que amplifican la diferencia entre sus bases. De lo
        parecidos que sean esos dos transistores salen el offset y el CMRR.
      </p>

      <h3 id="tr-bjt">Transistor bipolar (BJT)</h3>
      <p>
        El NPN tiene colector (C), base (B) y emisor (E). La unión base–emisor es un diodo: para que conduzca hace falta{' '}
        <M>{x('V', 'BE')} ≈ 0,6–0,7 V</M>. Una corriente chica en la base habilita una corriente unas β veces mayor del
        colector al emisor.
      </p>
      <Eq>
        {x('I', 'C')} = {x('I', 'S')} <i>e</i>
        <sup>
          V<sub>BE</sub>/V<sub>T</sub>
        </sup>
        , &nbsp; {x('I', 'C')} = <i>β</i> {x('I', 'B')}, &nbsp; {x('I', 'E')} = {x('I', 'C')} + {x('I', 'B')} = (<i>β</i> + 1) {x('I', 'B')}
      </Eq>
      <p>
        La ganancia de corriente β (o h<sub>FE</sub>) suele estar entre 100 y 300, pero varía muchísimo entre transistores
        del mismo modelo y con la temperatura. Un buen circuito no depende de su valor exacto.
      </p>
      <div className="th-table-wrap">
        <table className="th-table">
          <thead>
            <tr>
              <th>Región</th>
              <th>Condición</th>
              <th>Comportamiento</th>
              <th>Uso</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Corte</td>
              <td>V<sub>BE</sub> &lt; 0,5 V</td>
              <td>I<sub>C</sub> ≈ 0</td>
              <td>llave abierta</td>
            </tr>
            <tr>
              <td>Activa</td>
              <td>V<sub>BE</sub> ≈ 0,65 V, V<sub>CE</sub> &gt; 0,3 V</td>
              <td>I<sub>C</sub> = β I<sub>B</sub></td>
              <td>amplificador</td>
            </tr>
            <tr>
              <td>Saturación</td>
              <td>β I<sub>B</sub> &gt; I<sub>C</sub> que permite el circuito</td>
              <td>V<sub>CE</sub> ≈ 0,1–0,2 V</td>
              <td>llave cerrada</td>
            </tr>
          </tbody>
        </table>
      </div>
      <Derive>
        <li>
          Como amplificador interesa cuánto cambia I<sub>C</sub> ante un cambio chico de V<sub>BE</sub>: la{' '}
          <em>transconductancia</em>. Derivando la exponencial:
          <Eq>
            {x('g', 'm')} = <F n={<>d{x('I', 'C')}</>} d={<>d{x('V', 'BE')}</>} /> = <F n={x('I', 'C')} d={x('V', 'T')} /> &nbsp; (≈ 40 mS por cada mA de
            I<sub>C</sub>)
          </Eq>
        </li>
        <li>
          Su inversa es la resistencia interna del emisor, <M>{x('r', 'e')} = {x('V', 'T')}/{x('I', 'C')}</M>: unos 26 Ω con
          1 mA.
        </li>
        <li>
          Si en el colector hay una resistencia R<sub>C</sub>, un cambio Δv<sub>BE</sub> produce{' '}
          <M>
            Δ{x('v', 'o')} = −{x('g', 'm')} {x('R', 'C')} Δ{x('v', 'BE')}
          </M>
          : esa es la ganancia de tensión (con el signo menos porque al subir I<sub>C</sub> baja la tensión del colector).
        </li>
      </Derive>

      <h3 id="tr-mos">MOSFET</h3>
      <p>
        El MOSFET de canal N tiene drenador (D), gate (G) y fuente (S). El gate está aislado por una capa de óxido: en
        continua no entra corriente, se controla con <strong>tensión</strong>. Pero el gate es un capacitor, así que para
        conmutar rápido hay que cargarlo y descargarlo con picos de corriente.
      </p>
      <dl className="th-defs">
        <dt>Corte</dt>
        <dd>
          <M>{x('V', 'GS')} &lt; {x('V', 'th')}</M> (la tensión umbral, típicamente 1–4 V): no conduce.
        </dd>
        <dt>Triodo (zona óhmica)</dt>
        <dd>
          <M>{x('V', 'DS')} &lt; {x('V', 'GS')} − {x('V', 'th')}</M>: se comporta como una resistencia controlada por V
          <sub>GS</sub>. Es la región de la llave cerrada.
        </dd>
        <dt>Saturación</dt>
        <dd>
          <M>{x('V', 'DS')} &gt; {x('V', 'GS')} − {x('V', 'th')}</M>: la corriente casi no depende de V<sub>DS</sub>. Es la
          región del amplificador.
        </dd>
      </dl>
      <Derive>
        <li>
          El modelo cuadrático da, en triodo y en saturación:
          <Eq>
            {x('I', 'D')} = {x('k')} [({x('V', 'GS')} − {x('V', 'th')}) {x('V', 'DS')} − <F n={<>{x('V', 'DS')}²</>} d="2" />], &nbsp; {x('I', 'D')} ={' '}
            <F n={x('k')} d="2" /> ({x('V', 'GS')} − {x('V', 'th')})²
          </Eq>
        </li>
        <li>
          Con V<sub>DS</sub> chico (la llave cerrada) el término cuadrático no pesa y la corriente es proporcional a V
          <sub>DS</sub>, es decir, una resistencia:
          <Eq>
            {x('R', 'DS(on)')} = <F n="1" d={<>{x('k')} ({x('V', 'GS')} − {x('V', 'th')})</>} />
          </Eq>
          Cuanto más se pasa V<sub>GS</sub> del umbral, menor es. Por eso los MOSFET «de nivel lógico» especifican R
          <sub>DS(on)</sub> con 2,5 V o 4,5 V en el gate, lo que puede dar un microcontrolador.
        </li>
        <li>
          En saturación, derivando:{' '}
          <M>
            {x('g', 'm')} = {x('k')} ({x('V', 'GS')} − {x('V', 'th')}) = 2{x('I', 'D')}/({x('V', 'GS')} − {x('V', 'th')})
          </M>
          . Para la misma corriente suele ser varias veces menor que la del BJT (I<sub>C</sub>/V<sub>T</sub>): el MOSFET
          amplifica menos por miliamper.
        </li>
      </Derive>
      <p>
        Todo MOSFET de potencia trae además un <em>diodo de cuerpo</em> entre fuente y drenador, que conduce si el drenador
        queda por debajo de la fuente.
      </p>

      <h3 id="tr-cmp">¿Cuál conviene?</h3>
      <div className="th-table-wrap">
        <table className="th-table">
          <thead>
            <tr>
              <th />
              <th>BJT</th>
              <th>MOSFET</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Se controla con</td>
              <td>corriente de base</td>
              <td>tensión de gate</td>
            </tr>
            <tr>
              <td>Corriente de entrada</td>
              <td>I<sub>C</sub>/β (µA a mA)</td>
              <td>≈ 0 en continua; picos al conmutar</td>
            </tr>
            <tr>
              <td>Caída como llave</td>
              <td>V<sub>CE(sat)</sub> ≈ 0,2 V fija</td>
              <td>I · R<sub>DS(on)</sub> (mΩ en los de potencia)</td>
            </tr>
            <tr>
              <td>Ganancia (g<sub>m</sub>)</td>
              <td>alta: I<sub>C</sub>/V<sub>T</sub></td>
              <td>menor</td>
            </tr>
            <tr>
              <td>En la entrada de un amplificador</td>
              <td>poco ruido de tensión, pero corriente de entrada</td>
              <td>(o JFET) corriente de entrada casi nula: electrodos de alta impedancia</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3 id="tr-ex">Ejemplos de circuitos</h3>
      <Example n={1} title="NPN como llave: prender un LED desde un microcontrolador" sch={<LedSwitchSchematic />}>
        <p>
          Un pin de un microcontrolador de 3,3 V da pocos mA. Para prender un LED de 20 mA a 5 V (por ejemplo, el que
          parpadea con cada latido en un contador de pulso) se usa un transistor en saturación.
        </p>
        <ul className="th-steps">
          <li>
            <strong>R<sub>C</sub>:</strong> con el transistor saturado,{' '}
            <M>
              {x('R', 'C')} = (5 − 2 − 0,2) V / 20 mA = 140 Ω
            </M>{' '}
            → 150 Ω comercial, I<sub>C</sub> ≈ 18,7 mA.
          </li>
          <li>
            <strong>I<sub>B</sub> mínima:</strong> con β ≥ 100, 18,7 mA / 100 = 0,19 mA. Para saturar con seguridad (β
            varía) se da unas 5 veces más: ≈ 1 mA.
          </li>
          <li>
            <strong>R<sub>B</sub>:</strong>{' '}
            <M>
              {x('R', 'B')} = (3,3 − 0,7) V / 1 mA = 2,6 kΩ
            </M>{' '}
            → 2,7 kΩ. Verificación: β I<sub>B</sub> ≈ 96 mA ≫ 18,7 mA, así que está saturado.
          </li>
          <li>El transistor disipa apenas 0,2 V · 18,7 mA ≈ 3,7 mW.</li>
        </ul>
      </Example>
      <Example n={2} title="MOSFET como llave: un motor con diodo de rueda libre" sch={<MotorSwitchSchematic />}>
        <p>Un motor de 5 V que consume 0,5 A (el autito, por ejemplo), comandado por un pin de 3,3 V.</p>
        <ul className="th-steps">
          <li>
            <strong>¿Por qué MOSFET?</strong> Un BJT necesitaría 5–10 mA de base (demasiado para el pin) y perdería 0,2 V ·
            0,5 A = 100 mW. Un MOSFET de nivel lógico con R<sub>DS(on)</sub> = 50 mΩ a 2,5 V pierde{' '}
            <M>
              {x('I')}² {x('R', 'DS(on)')} = 0,5² · 0,05 = 12,5 mW
            </M>
            .
          </li>
          <li>
            <strong>100 Ω en el gate:</strong> limitan el pico de corriente al cargar la capacidad del gate (3,3 V / 100 Ω
            = 33 mA). <strong>100 kΩ a masa:</strong> mantienen el MOSFET apagado mientras el pin está flotando (al
            arrancar el microcontrolador).
          </li>
          <li>
            <strong>Diodo D:</strong> el motor es una inductancia y su corriente no puede cortarse de golpe:{' '}
            <M>
              {x('v')} = {x('L')} d{x('i')}/d{x('t')}
            </M>
            . Cortar 0,5 A en 100 ns con 1 mH pediría miles de voltios en el drenador. El diodo le da un camino a esa
            corriente para que se apague despacio, y el drenador queda en 5 V + 0,7 V.
          </li>
          <li>Prendiéndolo y apagándolo rápido (PWM), el ancho de los pulsos regula la velocidad.</li>
        </ul>
      </Example>
      <Example n={3} title="Amplificador de emisor común" sch={<CommonEmitterSchematic />}>
        <p>El amplificador básico con un solo transistor. Primero se fija el punto de trabajo en continua y después se calcula la ganancia.</p>
        <ul className="th-steps">
          <li>
            <strong>Base:</strong> el divisor R1–R2 fija{' '}
            <M>
              {x('V', 'B')} = 12 · 10/(47 + 10) ≈ 2,1 V
            </M>{' '}
            (vale si la corriente del divisor, 210 µA, es mucho mayor que I<sub>B</sub>, unos 7 µA).
          </li>
          <li>
            <strong>Emisor:</strong> <M>{x('V', 'E')} = 2,1 − 0,7 = 1,4 V</M>, así que{' '}
            <M>
              {x('I', 'E')} = 1,4 V / 1 kΩ ≈ 1,4 mA ≈ {x('I', 'C')}
            </M>
            . No depende de β: lo fija R<sub>E</sub>.
          </li>
          <li>
            <strong>Colector:</strong> <M>{x('V', 'C')} = 12 − 1,4 mA · 4,7 kΩ ≈ 5,4 V</M>; V<sub>CE</sub> ≈ 4 V &gt; 0,3 V,
            así que está en la región activa.
          </li>
          <li>
            <strong>Ganancia:</strong> con <M>{x('r', 'e')} = 26 mV / 1,4 mA ≈ 18 Ω</M>,
            <Eq>
              {x('A', 'v')} = −<F n={x('R', 'C')} d={<>{x('R', 'E')} + {x('r', 'e')}</>} /> ≈ −<F n="4,7 kΩ" d="1,02 kΩ" /> ≈ −4,6
            </Eq>
            R<sub>E</sub> es una realimentación negativa local: la ganancia la fijan las resistencias y no β, la misma idea
            que en los op-amps. Con un capacitor en paralelo con R<sub>E</sub> la ganancia sube a −R<sub>C</sub>/r
            <sub>e</sub> ≈ −250, pero pasa a depender de la temperatura y de I<sub>C</sub>.
          </li>
        </ul>
      </Example>
    </section>
  );
}
